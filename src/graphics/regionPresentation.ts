import { ColorPostProcess, type FramePostProcess } from './framePostProcess';
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PresentationRegion {
  source: Rect;
  target: Rect;
}
/** Coordinates are normalized with a top-left origin, shared by rendering and input. */
export function mapRegionPoint(x: number, y: number, regions: PresentationRegion[], reverse = false) {
  for (const region of regions) {
    const a = reverse ? region.source : region.target,
      b = reverse ? region.target : region.source;
    if (x >= a.x && y >= a.y && x <= a.x + a.width && y <= a.y + a.height)
      return { x: b.x + ((x - a.x) * b.width) / a.width, y: b.y + ((y - a.y) * b.height) / a.height };
  }
  return { x, y };
}
export function createRegionPresentation(
  gl: WebGL2RenderingContext,
  getRegions: () => PresentationRegion[],
): FramePostProcess {
  const pass = new ColorPostProcess(gl, {
    colorSampler: 'frameColor',
    vertex: `#version 300 es
    out vec2 uv;
    void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); uv=p; gl_Position=vec4(p*2.0-1.0,0,1); }`,
    fragment: `#version 300 es
    precision highp float;
    uniform sampler2D frameColor; uniform vec4 sources[3]; uniform vec4 targets[3];
    in vec2 uv; out vec4 color;
    void main(){ vec2 p=vec2(uv.x,1.0-uv.y); vec2 q=p;
      for(int i=0;i<3;i++){vec4 t=targets[i]; if(all(greaterThanEqual(p,t.xy))&&all(lessThanEqual(p,t.xy+t.zw))){q=sources[i].xy+(p-t.xy)*sources[i].zw/t.zw;break;}}
      color=texture(frameColor,vec2(q.x,1.0-q.y)); }`,
    bind: (gl, program) => {
      const regions = getRegions();
      for (let i = 0; i < 3; i++) {
        const r = regions[i] ?? {
          source: { x: 0, y: 0, width: 1, height: 1 },
          target: { x: 0, y: 0, width: 1, height: 1 },
        };
        for (const [name, v] of [
          ['sources', r.source],
          ['targets', r.target],
        ] as const)
          gl.uniform4f(gl.getUniformLocation(program, `${name}[${i}]`), v.x, v.y, v.width, v.height);
      }
    },
  });
  return {
    draw(w, h) {
      if (getRegions().length) pass.draw(w, h);
    },
    destroy() {
      pass.destroy();
    },
  };
}
