import { EventPoller } from '../event-poller';
import { SuiClient } from '@mysten/sui/client';

describe('EventPoller', () => {
    let client: SuiClient;
    let poller: EventPoller;

    beforeEach(() => {
        client = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
        poller = new EventPoller({
            client,
            filters: [{
                MoveEventType: '0x92fecee99603c0628ced2fbd37f85c05f6c0049c183eb6b1b58db24764c6c7bc::move_pump::TradedEvent'
            }]
        });
    });

    afterEach(() => {
        poller.stop();
    });

    it('should initialize with correct configuration', () => {
        const status = poller.getStatus();
        expect(status.isPolling).toBe(false);
        expect(status.filters).toHaveLength(1);
        expect(status.interval).toBe(5000);
    });

    it('should start and stop polling', () => {
        poller.start();
        expect(poller.getStatus().isPolling).toBe(true);

        poller.stop();
        expect(poller.getStatus().isPolling).toBe(false);
    });

    it('should handle errors through callback', (done) => {
        const errorCallback = jest.fn();
        const errorPoller = new EventPoller({
            client,
            filters: [{
                MoveEventType: 'invalid::type'
            }],
            onError: errorCallback
        });

        errorPoller.start();

        // Wait for potential error
        setTimeout(() => {
            expect(errorCallback).toHaveBeenCalled();
            errorPoller.stop();
            done();
        }, 1000);
    });

    it('should respect memory window settings', () => {
        const memoryPoller = new EventPoller({
            client,
            filters: [{
                MoveEventType: '0x...::module::Event'
            }],
            memoryWindow: 1000, // 1 second
            maxStoredEvents: 5
        });

        const status = memoryPoller.getStatus();
        expect(status.memoryUsage).toBeDefined();
    });

    it('should not start if already running', () => {
        poller.start();
        const consoleSpy = jest.spyOn(console, 'log');
        poller.start();
        expect(consoleSpy).toHaveBeenCalledWith('⚠️ EventPoller is already running');
    });

    it('should not stop if not running', () => {
        const consoleSpy = jest.spyOn(console, 'log');
        poller.stop();
        expect(consoleSpy).toHaveBeenCalledWith('⚠️ EventPoller is not running');
    });
}); 