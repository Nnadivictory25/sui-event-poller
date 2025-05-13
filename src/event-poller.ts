import type { SuiClient, SuiEvent, SuiEventFilter } from "@mysten/sui/client";

/**
 * Configuration options for the EventPoller
 * @interface EventPollerOptions
 */
export type EventPollerOptions = {
    /** Sui client instance to use for querying events */
    client: SuiClient;
    /** Array of event filters to monitor */
    filters: SuiEventFilter[];
    /** Polling interval in milliseconds (default: 5000) */
    interval?: number;
    /** Callback function for new events */
    onNewEvents?: (events: SuiEvent[]) => void;
    /** Callback function for errors */
    onError?: (error: Error) => void;
    /** Whether to only process events from now onwards (default: true) */
    startFromNow?: boolean;
    /** How long to keep event IDs in memory in milliseconds (default: 1 hour) */
    memoryWindow?: number;
    /** Maximum number of event IDs to store per filter (default: 1000) */
    maxStoredEvents?: number;
}

/**
 * Internal state for tracking cursor position and processed events
 * @interface CursorState
 */
interface CursorState {
    /** Timestamp of the last processed event */
    lastProcessedTimestamp: number;
    /** Map of processed event IDs to their timestamps */
    processedEventIds: Map<string, number>;
}

/**
 * A class for polling Sui blockchain events with memory-efficient duplicate detection
 * @class EventPoller
 * @example
 * ```typescript
 * const poller = new EventPoller({
 *   client: new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' }),
 *   filters: [{
 *     MoveEventType: '0x...::module::Event'
 *   }],
 *   interval: 5000,
 *   onNewEvents: (events) => console.log('✨ New events:', events),
 *   onError: (error) => console.error('🔴 Error:', error)
 * });
 * ```
 */
export class EventPoller {
    private client: SuiClient;
    private filters: SuiEventFilter[];
    private interval: number;
    private onNewEvents: (events: SuiEvent[]) => void;
    private onError: (error: Error) => void;
    private states: Map<string, CursorState>;
    private isPolling: boolean = false;
    private intervalId?: ReturnType<typeof setInterval>;
    private startTime: number;
    private memoryWindow: number;
    private maxStoredEvents: number;
    private cleanupIntervalId?: ReturnType<typeof setInterval>;

    /**
     * Creates a new EventPoller instance
     * @param {Object} options - Configuration options for the poller
     * @param {SuiClient} options.client - Sui client instance to use for querying events
     * @param {SuiEventFilter[]} options.filters - Array of event filters to monitor
     * @param {number} [options.interval=5000] - Polling interval in milliseconds
     * @param {function(SuiEvent[]): void} [options.onNewEvents=()=>{}] - Callback function for new events
     * @param {function(Error): void} [options.onError=(error)=>console.error] - Callback function for errors
     * @param {boolean} [options.startFromNow=true] - Whether to only process events from now onwards
     * @param {number} [options.memoryWindow=3600000] - How long to keep event IDs in memory in milliseconds (default: 1 hour)
     * @param {number} [options.maxStoredEvents=1000] - Maximum number of event IDs to store per filter
     * @example
     * ```typescript
     * const poller = new EventPoller({
     *   client: new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' }),
     *   filters: [{ MoveEventType: '0x...::module::Event' }],
     *   interval: 5000,
     *   onNewEvents: (events) => console.log('New events:', events)
     * });
     * ```
     */
    constructor({
        client,
        filters,
        interval = 5000,
        onNewEvents = () => { },
        onError = (error) => console.error('🔴 EventPoller Error:', error),
        startFromNow = true,
        memoryWindow = 1000 * 60 * 60,
        maxStoredEvents = 1000
    }: EventPollerOptions) {
        this.client = client;
        this.filters = filters;
        this.interval = interval;
        this.onNewEvents = onNewEvents;
        this.onError = onError;
        this.startTime = startFromNow ? Date.now() : 0;
        this.memoryWindow = memoryWindow;
        this.maxStoredEvents = maxStoredEvents;

        this.states = new Map(
            filters.map(filter => [
                JSON.stringify(filter),
                {
                    lastProcessedTimestamp: this.startTime,
                    processedEventIds: new Map<string, number>()
                }
            ])
        );

        console.log(`⏰ EventPoller initialized at ${new Date(this.startTime).toISOString()}`);
    }

    /**
     * Starts the event polling process
     * @throws {Error} If the poller is already running
     */
    public start(): void {
        if (this.isPolling) {
            console.log('⚠️ EventPoller is already running');
            return;
        }

        this.isPolling = true;
        console.log('🚀 Starting EventPoller...');

        this.pollEvents().catch(this.onError);
        console.log("🟢 EventPoller started\n=>Polling Events...");


        this.intervalId = setInterval(() => {
            this.pollEvents().catch(this.onError);
        }, this.interval);

        this.cleanupIntervalId = setInterval(() => {
            this.cleanupOldEvents();
        }, 1000 * 60 * 5);
    }

    /**
     * Stops the event polling process
     * @throws {Error} If the poller is not running
     */
    public stop(): void {
        if (!this.isPolling) {
            console.log('⚠️ EventPoller is not running');
            return;
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            this.cleanupIntervalId = undefined;
        }

        this.isPolling = false;
        console.log('🛑 EventPoller stopped');
    }

    /**
     * Cleans up old events based on memory window and size limits
     * @private
     */
    private cleanupOldEvents(): void {
        const now = Date.now();
        const cutoffTime = now - this.memoryWindow;

        for (const [filterKey, state] of this.states.entries()) {
            for (const [eventId, timestamp] of state.processedEventIds.entries()) {
                if (timestamp < cutoffTime) {
                    state.processedEventIds.delete(eventId);
                }
            }

            if (state.processedEventIds.size > this.maxStoredEvents) {
                const sortedEvents = Array.from(state.processedEventIds.entries())
                    .sort(([, a], [, b]) => a - b);

                const eventsToRemove = sortedEvents.slice(0, state.processedEventIds.size - this.maxStoredEvents);
                for (const [eventId] of eventsToRemove) {
                    state.processedEventIds.delete(eventId);
                }
            }

            this.states.set(filterKey, state);
        }

        console.log(`🧹 Cleaned up old events. Current memory usage: ${this.getMemoryUsage()}`);
    }

    /**
     * Gets the current memory usage statistics
     * @private
     * @returns {string} Memory usage information
     */
    private getMemoryUsage(): string {
        let totalEvents = 0;
        for (const state of this.states.values()) {
            totalEvents += state.processedEventIds.size;
        }
        return `${totalEvents} events tracked`;
    }

    /**
     * Polls for new events across all filters
     * @private
     * @returns {Promise<void>}
     */
    private async pollEvents(): Promise<void> {
        try {
            const eventsPromises = this.filters.map(filter =>
                this.fetchNewEventsForFilter(filter)
                    .catch(error => {
                        this.onError(error instanceof Error ? error : new Error(String(error)));
                        return [];
                    })
            );

            const eventsArrays = await Promise.all(eventsPromises);
            const allNewEvents = eventsArrays.flat();

            if (allNewEvents.length > 0) {
                allNewEvents.sort((a, b) => Number(a.timestampMs) - Number(b.timestampMs));
                console.log(`✨ Found ${allNewEvents.length} new events`);
                this.onNewEvents(allNewEvents);
            }
        } catch (error) {
            this.onError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Fetches new events for a specific filter
     * @private
     * @param filter - The event filter to query
     * @returns {Promise<SuiEvent[]>} Array of new events
     */
    private async fetchNewEventsForFilter(filter: SuiEventFilter): Promise<SuiEvent[]> {
        const filterKey = JSON.stringify(filter);
        const state = this.states.get(filterKey)!;

        try {
            const response = await this.client.queryEvents({
                query: filter,
                limit: 50,
                order: 'descending'
            });

            const events = response.data;

            if (events.length === 0) {
                return [];
            }

            const now = Date.now();

            const newEvents = events.filter(event => {
                const eventTime = Number(event.timestampMs);
                const eventId = `${event.id.txDigest}:${event.id.eventSeq}`;
                return eventTime > state.lastProcessedTimestamp && !state.processedEventIds.has(eventId);
            });

            if (newEvents.length > 0) {
                // Update the last processed timestamp with the latest event time
                const latestEventTime = Math.max(...newEvents.map(e => Number(e.timestampMs)));
                state.lastProcessedTimestamp = Math.max(state.lastProcessedTimestamp, latestEventTime);

                newEvents.forEach(event => {
                    const eventId = `${event.id.txDigest}:${event.id.eventSeq}`;
                    state.processedEventIds.set(eventId, now);
                });

                this.states.set(filterKey, state);
            }

            return newEvents;
        } catch (error) {
            console.error('🔴 Error fetching events:', error);
            throw error;
        }
    }

    /**
     * Gets the current status of the poller
     * @returns {Object} Status information including polling state, filters, interval, and memory usage
     */
    public getStatus(): {
        isPolling: boolean;
        filters: SuiEventFilter[];
        interval: number;
        startTime: number;
        memoryUsage: string;
    } {
        return {
            isPolling: this.isPolling,
            filters: this.filters,
            interval: this.interval,
            startTime: this.startTime,
            memoryUsage: this.getMemoryUsage()
        };
    }
}
