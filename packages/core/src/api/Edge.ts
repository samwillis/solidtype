/**
 * Edge wrapper class
 * 
 * Provides an object-oriented interface to edge entities in the BREP model.
 */

import type { BodyId, EdgeId } from '../topo/handles.js';
import type { SolidSession } from './SolidSession.js';

/**
 * Edge wrapper class
 */
export class Edge {
  constructor(
    private readonly session: SolidSession,
    private readonly bodyId: BodyId,
    public readonly id: EdgeId
  ) {}
  
  /**
   * Get the body ID this edge belongs to
   */
  getBodyId(): BodyId {
    return this.bodyId;
  }
  
  /**
   * Get the session this edge belongs to
   * @internal For advanced use
   */
  getSession(): SolidSession {
    return this.session;
  }
}
