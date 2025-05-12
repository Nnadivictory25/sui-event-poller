import { EventPoller } from './event-poller';
import { SuiClient } from '@mysten/sui/client';

describe('EventPoller', () => {
    let client: SuiClient;
    let poller: EventPoller;

    beforeEach(() => {
        client = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
        poller = new EventPoller({
            client,
            filters: [{
                MoveEventType: '0x...::module::Event'
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
}); 