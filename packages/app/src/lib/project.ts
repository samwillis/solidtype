import * as Y from 'yjs';

export interface Project {
  doc: Y.Doc;
  files: Y.Map<Y.Text>;
}

export function createProject(): Project {
  const doc = new Y.Doc();
  const files = doc.getMap<Y.Text>('files');
  return { doc, files };
}

export function initializeProject(project: Project): void {
  // Initialize with a default Part.tsx file that demonstrates the DSL
  const partFile = new Y.Text();
  const sampleCode = `/** @jsx sjsx */
import { sjsx, Model, Sketch, Rectangle, Extrude } from '@solidtype/dsl';

export type PartProps = {
  width?: number;
  height?: number;
  depth?: number;
};

export function Part(props: PartProps = {}) {
  const width = props.width ?? 10;
  const height = props.height ?? 8;
  const depth = props.depth ?? 5;

  return (
    <Model>
      <Sketch id="base" plane="XY">
        <Rectangle width={width} height={height} />
      </Sketch>
      <Extrude sketch="base" distance={depth} />
    </Model>
  );
}
`;
  partFile.insert(0, sampleCode);
  project.files.set('Part.tsx', partFile);
}
