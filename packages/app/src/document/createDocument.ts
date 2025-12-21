/**
 * Document creation and initialization
 */

import * as Y from 'yjs';
import type { IdCounters } from '../types/document';

export interface SolidTypeDoc {
  ydoc: Y.Doc;
  meta: Y.Map<string | number>;
  state: Y.Map<unknown>;
  features: Y.XmlFragment;
  counters: Y.Map<number>;
}

/**
 * Create a new SolidType document with default features
 */
export function createDocument(): SolidTypeDoc {
  const ydoc = new Y.Doc();
  const meta = ydoc.getMap<string | number>('meta');
  const state = ydoc.getMap<unknown>('state');
  const features = ydoc.getXmlFragment('features');
  const counters = ydoc.getMap<number>('counters');

  // Initialize meta
  meta.set('name', 'Untitled');
  meta.set('created', Date.now());
  meta.set('modified', Date.now());
  meta.set('version', 1);
  meta.set('units', 'mm');

  // Initialize state
  state.set('rebuildGate', null);

  // Initialize default features
  initializeDefaultFeatures(features);

  return { ydoc, meta, state, features, counters };
}

/** Default plane dimensions in document units */
const DEFAULT_PLANE_WIDTH = 100;
const DEFAULT_PLANE_HEIGHT = 100;

/**
 * Initialize the default datum features (origin + planes)
 */
function initializeDefaultFeatures(features: Y.XmlFragment): void {
  // Add origin (default: not visible)
  const origin = new Y.XmlElement('origin');
  origin.setAttribute('id', 'origin');
  origin.setAttribute('visible', 'false');
  features.push([origin]);

  // Add XY plane (default: visible with 100x100 dimensions)
  const xyPlane = new Y.XmlElement('plane');
  xyPlane.setAttribute('id', 'xy');
  xyPlane.setAttribute('name', 'XY Plane');
  xyPlane.setAttribute('normal', '0,0,1');
  xyPlane.setAttribute('origin', '0,0,0');
  xyPlane.setAttribute('xDir', '1,0,0');
  xyPlane.setAttribute('visible', 'true');
  xyPlane.setAttribute('width', String(DEFAULT_PLANE_WIDTH));
  xyPlane.setAttribute('height', String(DEFAULT_PLANE_HEIGHT));
  xyPlane.setAttribute('offsetX', '0');
  xyPlane.setAttribute('offsetY', '0');
  features.push([xyPlane]);

  // Add XZ plane (default: visible with 100x100 dimensions)
  const xzPlane = new Y.XmlElement('plane');
  xzPlane.setAttribute('id', 'xz');
  xzPlane.setAttribute('name', 'XZ Plane');
  xzPlane.setAttribute('normal', '0,1,0');
  xzPlane.setAttribute('origin', '0,0,0');
  xzPlane.setAttribute('xDir', '1,0,0');
  xzPlane.setAttribute('visible', 'true');
  xzPlane.setAttribute('width', String(DEFAULT_PLANE_WIDTH));
  xzPlane.setAttribute('height', String(DEFAULT_PLANE_HEIGHT));
  xzPlane.setAttribute('offsetX', '0');
  xzPlane.setAttribute('offsetY', '0');
  features.push([xzPlane]);

  // Add YZ plane (default: visible with 100x100 dimensions)
  const yzPlane = new Y.XmlElement('plane');
  yzPlane.setAttribute('id', 'yz');
  yzPlane.setAttribute('name', 'YZ Plane');
  yzPlane.setAttribute('normal', '1,0,0');
  yzPlane.setAttribute('origin', '0,0,0');
  yzPlane.setAttribute('xDir', '0,1,0');
  yzPlane.setAttribute('visible', 'true');
  yzPlane.setAttribute('width', String(DEFAULT_PLANE_WIDTH));
  yzPlane.setAttribute('height', String(DEFAULT_PLANE_HEIGHT));
  yzPlane.setAttribute('offsetX', '0');
  yzPlane.setAttribute('offsetY', '0');
  features.push([yzPlane]);
}

/**
 * Get ID counters from Yjs map
 */
export function getCounters(doc: SolidTypeDoc): IdCounters {
  const result: IdCounters = {};
  doc.counters.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Update ID counter in Yjs
 */
export function updateCounter(doc: SolidTypeDoc, prefix: string, value: number): void {
  doc.counters.set(prefix, value);
}
