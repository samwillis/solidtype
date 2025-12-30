/**
 * Type declarations for opencascade.js
 * 
 * This is a minimal type declaration for the parts of OpenCascade.js we use.
 * The full library has extensive APIs, but we only declare what we need.
 */

declare module 'opencascade.js' {
  export interface OpenCascadeInstance {
    // Filesystem
    FS: {
      readFile(path: string): ArrayBuffer;
      writeFile(path: string, data: Uint8Array | ArrayBuffer): void;
      unlink(path: string): void;
    };

    // Points and vectors
    gp_Pnt_3: new (x: number, y: number, z: number) => gp_Pnt;
    gp_Dir_4: new (x: number, y: number, z: number) => gp_Dir;
    gp_Vec_4: new (x: number, y: number, z: number) => gp_Vec;
    gp_Ax1_2: new (p: gp_Pnt, d: gp_Dir) => gp_Ax1;
    // gp_Ax2 constructors: _1=default, _2=3-param (P,N,Vx), _3=2-param (P,V)
    gp_Ax2_2: new (p: gp_Pnt, n: gp_Dir, vx: gp_Dir) => gp_Ax2;
    gp_Ax2_3: new (p: gp_Pnt, v: gp_Dir) => gp_Ax2;
    // gp_Ax3 constructors: _1=default, _2=2-param (P,V), _3=3-param (P,N,Vx)
    gp_Ax3_3: new (p: gp_Pnt, n: gp_Dir, vx: gp_Dir) => gp_Ax3;
    gp_Circ_2: new (axis: gp_Ax2, radius: number) => gp_Circ;
    // gp_Pln constructors: _2=from gp_Ax3, _3=from point and normal
    gp_Pln_2: new (axis: gp_Ax3) => gp_Pln;
    gp_Pln_3: new (p: gp_Pnt, n: gp_Dir) => gp_Pln;
    gp_Trsf_1: new () => gp_Trsf;

    // Primitives - constructor numbering for BRepPrimAPI_MakeBox:
    // _1 = (dx, dy, dz) - 3 params
    // _2 = (P, dx, dy, dz) - 4 params
    // _3 = (P1, P2) - 2 params
    // _4 = (Axes, dx, dy, dz) - 4 params
    BRepPrimAPI_MakeBox_1: new (dx: number, dy: number, dz: number) => BRepPrimAPI_MakeBox;
    BRepPrimAPI_MakeBox_2: new (p: gp_Pnt, dx: number, dy: number, dz: number) => BRepPrimAPI_MakeBox;
    BRepPrimAPI_MakeBox_3: new (p1: gp_Pnt, p2: gp_Pnt) => BRepPrimAPI_MakeBox;
    BRepPrimAPI_MakeBox_4: new (axes: gp_Ax2, dx: number, dy: number, dz: number) => BRepPrimAPI_MakeBox;
    BRepPrimAPI_MakeCylinder_1: new (r: number, h: number) => BRepPrimAPI_MakeCylinder;
    BRepPrimAPI_MakeSphere_1: new (r: number) => BRepPrimAPI_MakeSphere;
    BRepPrimAPI_MakeCone_1: new (r1: number, r2: number, h: number) => BRepPrimAPI_MakeCone;
    BRepPrimAPI_MakeTorus_1: new (r1: number, r2: number) => BRepPrimAPI_MakeTorus;
    BRepPrimAPI_MakePrism_1: new (s: TopoDS_Shape, v: gp_Vec, copy: boolean, canonize: boolean) => BRepPrimAPI_MakePrism;
    BRepPrimAPI_MakePrism_2: new (s: TopoDS_Shape, v: gp_Vec, symmetric: boolean, canonize: boolean) => BRepPrimAPI_MakePrism;
    BRepPrimAPI_MakeRevol_1: new (s: TopoDS_Shape, axis: gp_Ax1, angle: number, copy: boolean) => BRepPrimAPI_MakeRevol;

    // Boolean operations - _3 constructors take (S1, S2) and perform operation immediately
    BRepAlgoAPI_Fuse_3: new (s1: TopoDS_Shape, s2: TopoDS_Shape) => BRepAlgoAPI_BooleanOperation;
    BRepAlgoAPI_Cut_3: new (s1: TopoDS_Shape, s2: TopoDS_Shape) => BRepAlgoAPI_BooleanOperation;
    BRepAlgoAPI_Common_3: new (s1: TopoDS_Shape, s2: TopoDS_Shape) => BRepAlgoAPI_BooleanOperation;

    // Builder API
    BRepBuilderAPI_MakeEdge_3: new (p1: gp_Pnt, p2: gp_Pnt) => BRepBuilderAPI_MakeEdge;
    BRepBuilderAPI_MakeEdge_8: new (c: gp_Circ) => BRepBuilderAPI_MakeEdge;
    BRepBuilderAPI_MakeEdge_9: new (c: gp_Circ, u1: number, u2: number) => BRepBuilderAPI_MakeEdge;
    BRepBuilderAPI_MakeWire_1: new () => BRepBuilderAPI_MakeWire;
    BRepBuilderAPI_MakeWire_2: new (e: TopoDS_Edge) => BRepBuilderAPI_MakeWire;
    // MakeFace constructors - numbering varies by OpenCascade.js version
    BRepBuilderAPI_MakeFace_15: new (w: TopoDS_Wire, onlyPlane: boolean) => BRepBuilderAPI_MakeFace;
    BRepBuilderAPI_MakeFace_16: new (p: gp_Pln, w: TopoDS_Wire, inside: boolean) => BRepBuilderAPI_MakeFace;
    BRepBuilderAPI_Copy_2: new (s: TopoDS_Shape, copyGeom: boolean, copyMesh: boolean) => BRepBuilderAPI_Copy;
    BRepBuilderAPI_Transform_2: new (s: TopoDS_Shape, t: gp_Trsf, copy: boolean) => BRepBuilderAPI_Transform;

    // Fillet/Chamfer
    BRepFilletAPI_MakeFillet: new (s: TopoDS_Shape, mode: ChFi3d_FilletShape) => BRepFilletAPI_MakeFillet;
    BRepFilletAPI_MakeChamfer: new (s: TopoDS_Shape) => BRepFilletAPI_MakeChamfer;
    // Enum accessed as oc.ChFi3d_FilletShape.ChFi3d_Rational
    ChFi3d_FilletShape: {
      ChFi3d_Rational: ChFi3d_FilletShape;
      ChFi3d_QuasiAngular: ChFi3d_FilletShape;
      ChFi3d_Polynomial: ChFi3d_FilletShape;
    };

    // Mesh
    BRepMesh_IncrementalMesh_2: new (
      s: TopoDS_Shape,
      d: number,
      relative: boolean,
      angDeflection: number,
      inParallel: boolean
    ) => BRepMesh_IncrementalMesh;

    // Topology exploration
    TopExp_Explorer_2: new (s: TopoDS_Shape, toFind: TopAbs_ShapeEnum, toAvoid: TopAbs_ShapeEnum) => TopExp_Explorer;
    TopExp: {
      MapShapesAndAncestors(
        s: TopoDS_Shape,
        ts: TopAbs_ShapeEnum,
        ta: TopAbs_ShapeEnum,
        m: TopTools_IndexedDataMapOfShapeListOfShape
      ): void;
    };
    TopAbs_ShapeEnum: {
      TopAbs_VERTEX: TopAbs_ShapeEnum;
      TopAbs_EDGE: TopAbs_ShapeEnum;
      TopAbs_FACE: TopAbs_ShapeEnum;
      TopAbs_SHAPE: TopAbs_ShapeEnum;
    };
    TopAbs_Orientation: {
      TopAbs_FORWARD: TopAbs_Orientation;
      TopAbs_REVERSED: TopAbs_Orientation;
    };
    TopoDS: {
      Face_1(s: TopoDS_Shape): TopoDS_Face;
      Edge_1(s: TopoDS_Shape): TopoDS_Edge;
    };

    // Tools
    TopTools_IndexedDataMapOfShapeListOfShape_1: new () => TopTools_IndexedDataMapOfShapeListOfShape;

    // BRep tools
    BRep_Tool: {
      Triangulation(face: TopoDS_Face, location: TopLoc_Location, polyAlgo: number): Handle_Poly_Triangulation;
    };
    BRep_Builder: new () => BRep_Builder;
    BRepTools: {
      Write_2(s: TopoDS_Shape, filename: string, progress: Message_ProgressRange): boolean;
      Read_2(s: TopoDS_Shape, filename: string, builder: BRep_Builder, progress: Message_ProgressRange): boolean;
    };

    // Bounding box
    Bnd_Box_1: new () => Bnd_Box;
    BRepBndLib: {
      Add(s: TopoDS_Shape, box: Bnd_Box, useTriangulation: boolean): void;
    };

    // STEP I/O
    STEPControl_Writer_1: new () => STEPControl_Writer;
    STEPControl_Reader_1: new () => STEPControl_Reader;
    STEPControl_StepModelType: {
      STEPControl_AsIs: STEPControl_StepModelType;
    };
    IFSelect_ReturnStatus: {
      IFSelect_RetDone: IFSelect_ReturnStatus;
    };

    // Progress
    Message_ProgressRange_1: new () => Message_ProgressRange;

    // Location
    TopLoc_Location_1: new () => TopLoc_Location;

    // TopoDS_Shape
    TopoDS_Shape: new () => TopoDS_Shape;
  }

  // Shape types
  export interface TopoDS_Shape {
    IsNull(): boolean;
    Orientation_1(): TopAbs_Orientation;
    delete(): void;
  }

  export interface TopoDS_Face extends TopoDS_Shape {}
  export interface TopoDS_Edge extends TopoDS_Shape {}
  export interface TopoDS_Wire extends TopoDS_Shape {}

  // Geometry types
  export interface gp_Pnt {
    X(): number;
    Y(): number;
    Z(): number;
    Transformed(t: gp_Trsf): gp_Pnt;
    delete(): void;
  }

  export interface gp_Dir {
    delete(): void;
  }

  export interface gp_Vec {
    delete(): void;
  }

  export interface gp_Ax1 {
    delete(): void;
  }

  export interface gp_Ax2 {
    delete(): void;
  }

  export interface gp_Ax3 {
    delete(): void;
  }

  export interface gp_Circ {
    delete(): void;
  }

  export interface gp_Pln {
    delete(): void;
  }

  export interface gp_Trsf {
    SetTranslation_1(v: gp_Vec): void;
    SetRotation_1(axis: gp_Ax1, angle: number): void;
    delete(): void;
  }

  // Enums
  export type TopAbs_ShapeEnum = number;
  export type TopAbs_Orientation = number;
  export type STEPControl_StepModelType = number;
  export type IFSelect_ReturnStatus = number;

  // Builder result interfaces
  export interface BRepBuilderAPI_MakeShape {
    IsDone(): boolean;
    Shape(): TopoDS_Shape;
    delete(): void;
  }

  export interface BRepPrimAPI_MakeBox extends BRepBuilderAPI_MakeShape {}
  export interface BRepPrimAPI_MakeCylinder extends BRepBuilderAPI_MakeShape {}
  export interface BRepPrimAPI_MakeSphere extends BRepBuilderAPI_MakeShape {}
  export interface BRepPrimAPI_MakeCone extends BRepBuilderAPI_MakeShape {}
  export interface BRepPrimAPI_MakeTorus extends BRepBuilderAPI_MakeShape {}
  export interface BRepPrimAPI_MakePrism extends BRepBuilderAPI_MakeShape {}
  export interface BRepPrimAPI_MakeRevol extends BRepBuilderAPI_MakeShape {}

  export interface BRepAlgoAPI_BooleanOperation extends BRepBuilderAPI_MakeShape {
    // Build is not needed for _3 constructors which perform operation immediately
  }

  export interface BRepBuilderAPI_MakeEdge extends BRepBuilderAPI_MakeShape {
    Edge(): TopoDS_Edge;
  }

  export interface BRepBuilderAPI_MakeWire extends BRepBuilderAPI_MakeShape {
    Add_1(edge: TopoDS_Edge): void;
    Wire(): TopoDS_Wire;
  }

  export interface BRepBuilderAPI_MakeFace extends BRepBuilderAPI_MakeShape {
    Add(w: TopoDS_Wire): void;
    Face(): TopoDS_Face;
  }

  export interface BRepBuilderAPI_Copy extends BRepBuilderAPI_MakeShape {}
  export interface BRepBuilderAPI_Transform extends BRepBuilderAPI_MakeShape {}

  export interface BRepFilletAPI_MakeFillet extends BRepBuilderAPI_MakeShape {
    Add_2(radius: number, edge: TopoDS_Edge): void;
    Build(): void;
  }

  export interface BRepFilletAPI_MakeChamfer extends BRepBuilderAPI_MakeShape {
    // _2 = (distance, edge) - symmetric chamfer
    Add_2(distance: number, edge: TopoDS_Edge): void;
    Build(): void;
  }

  // Enums
  export type ChFi3d_FilletShape = number;

  // Mesh
  export interface BRepMesh_IncrementalMesh {
    Perform_1(): void;
    delete(): void;
  }

  // Exploration
  export interface TopExp_Explorer {
    More(): boolean;
    Next(): void;
    Current(): TopoDS_Shape;
    delete(): void;
  }

  export interface TopTools_IndexedDataMapOfShapeListOfShape {
    FindFromKey(key: TopoDS_Shape): TopTools_ListOfShape;
    delete(): void;
  }

  export interface TopTools_ListOfShape {
    IsEmpty(): boolean;
    First(): TopoDS_Shape;
  }

  // Location
  export interface TopLoc_Location {
    Transformation(): gp_Trsf;
    delete(): void;
  }

  // Triangulation
  export interface Handle_Poly_Triangulation {
    IsNull(): boolean;
    get(): Poly_Triangulation;
  }

  export interface Poly_Triangulation {
    NbNodes(): number;
    NbTriangles(): number;
    Node(i: number): gp_Pnt;
    Triangle(i: number): Poly_Triangle;
    HasUVNodes(): boolean;
    UVNode(i: number): { U(): number; V(): number };
  }

  export interface Poly_Triangle {
    Value(i: number): number;
  }

  // Bounding box
  export interface Bnd_Box {
    Get(
      xMin: { current: number },
      yMin: { current: number },
      zMin: { current: number },
      xMax: { current: number },
      yMax: { current: number },
      zMax: { current: number }
    ): void;
    delete(): void;
  }

  // STEP I/O
  export interface STEPControl_Writer {
    Transfer(s: TopoDS_Shape, mode: STEPControl_StepModelType, compgraph: boolean, progress: Message_ProgressRange): void;
    Write(filename: string): IFSelect_ReturnStatus;
    delete(): void;
  }

  export interface STEPControl_Reader {
    ReadFile(filename: string): IFSelect_ReturnStatus;
    TransferRoots(progress: Message_ProgressRange): number;
    OneShape(): TopoDS_Shape;
    delete(): void;
  }

  // BRep builder
  export interface BRep_Builder {
    delete(): void;
  }

  // Progress
  export interface Message_ProgressRange {
    delete(): void;
  }

  // Main function
  export default function initOpenCascade(): Promise<OpenCascadeInstance>;
}

// Vite-specific ?url import pattern for WASM files
// The package uses opencascade.wasm.js and opencascade.wasm.wasm (not .full)
declare module 'opencascade.js/dist/opencascade.wasm.js' {
  // The default export is a constructor, not a function
  const OpenCascadeModule: new (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<import('opencascade.js').OpenCascadeInstance>;
  export default OpenCascadeModule;
}

declare module 'opencascade.js/dist/opencascade.wasm.wasm?url' {
  const url: string;
  export default url;
}
