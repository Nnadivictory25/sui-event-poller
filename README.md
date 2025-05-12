# @nnadivictory/sui-event-poller

A memory-efficient event poller for the Sui blockchain. This package offers a reliable method to track and handle Sui blockchain events with integrated duplicate detection and memory optimization.

## Features

- 🚀 Memory-efficient event tracking
- 🔄 Automatic duplicate detection
- ⏰ Configurable polling intervals
- 🧹 Automatic cleanup of old events
- 📊 Memory usage monitoring
- 🛡️ Error handling with callbacks
- 🎯 TypeScript support

## Installation

```bash
npm install @nnadivictory/sui-event-poller
```

## Usage

```typescript
import { EventPoller } from '@nnadivictory/sui-event-poller';
import { SuiClient } from '@mysten/sui';

// Initialize Sui client
const client = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });

// Create event poller instance
const poller = new EventPoller({
	client,
	filters: [
		{
			MoveEventType: '0x...::module::Event',
		},
	],
	interval: 5000, // Poll every 5 seconds
	onNewEvents: (events) => {
		console.log('📥 New events:', events);
	},
	onError: (error) => {
		console.error('🔴 Error:', error);
	},
});

// Start polling
poller.start();

// Get current status
const status = poller.getStatus();
console.log('📊 Status:', status);

// Stop polling when done
poller.stop();
```

## Configuration Options

```typescript
interface EventPollerOptions {
	client: SuiClient; // Sui client instance
	filters: SuiEventFilter[]; // Array of event filters to monitor
	interval?: number; // Polling interval in milliseconds (default: 5000)
	onNewEvents?: (events: SuiEvent[]) => void; // Callback for new events
	onError?: (error: Error) => void; // Callback for errors
	startFromNow?: boolean; // Only process events from now onwards (default: true)
	memoryWindow?: number; // How long to keep event IDs in memory (default: 1 hour)
	maxStoredEvents?: number; // Maximum number of event IDs to store per filter (default: 1000)
}
```

## Memory Management

The poller automatically manages memory by:

- Keeping track of processed events for a configurable time window
- Limiting the number of stored events per filter
- Cleaning up old events periodically

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
