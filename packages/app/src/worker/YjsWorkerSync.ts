/**
 * YjsWorkerSync - syncs a Y.Doc between main thread and worker
 */

import * as Y from 'yjs';

export class YjsWorkerSync {
  private channel: MessageChannel;
  private port: MessagePort;

  constructor(
    private doc: Y.Doc,
    worker: Worker
  ) {
    // Create dedicated channel for Yjs sync
    this.channel = new MessageChannel();
    this.port = this.channel.port1;

    // Send port2 to worker
    worker.postMessage(
      { type: 'init-sync', port: this.channel.port2 },
      [this.channel.port2]
    );

    // Handle sync messages from worker (if worker ever sends updates)
    this.port.onmessage = (event) => {
      if (event.data.type === 'yjs-update') {
        this.handleWorkerUpdate(event.data.data);
      }
    };

    // Observe local changes and send to worker
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'worker') {
        this.sendUpdate(update);
      }
    });

    // Send initial state
    this.sendInitialState();
  }

  private sendInitialState(): void {
    const state = Y.encodeStateAsUpdate(this.doc);
    this.port.postMessage(
      { type: 'yjs-init', data: state },
      [state.buffer]
    );
  }

  private sendUpdate(update: Uint8Array): void {
    // Clone the update to avoid issues with transferred buffers
    const clone = new Uint8Array(update);
    this.port.postMessage(
      { type: 'yjs-update', data: clone },
      [clone.buffer]
    );
  }

  private handleWorkerUpdate(data: Uint8Array): void {
    Y.applyUpdate(this.doc, data, 'worker');
  }

  /**
   * Disconnect the sync
   */
  disconnect(): void {
    this.port.close();
  }
}
