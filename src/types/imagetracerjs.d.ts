declare module 'imagetracerjs' {
  interface ImageTracerOptions {
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    colorsampling?: number;
    numberofcolors?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    layering?: number;
    strokewidth?: number;
    linefilter?: boolean;
    scale?: number;
    roundcoords?: number;
    desc?: boolean;
    viewbox?: boolean;
    blurradius?: number;
    blurdelta?: number;
  }

  interface ImageTracer {
    imageToSVG(
      url: string | HTMLImageElement | ImageData,
      callback: (svgstr: string) => void,
      options?: string | ImageTracerOptions
    ): void;
    imagedataToSVG(imagedata: ImageData, options?: string | ImageTracerOptions): string;
    imagedataToTracedata(imagedata: ImageData, options?: string | ImageTracerOptions): unknown;
    imageToTracedata(
      url: string | HTMLImageElement | ImageData,
      callback: (tracedata: unknown) => void,
      options?: string | ImageTracerOptions
    ): void;
  }

  const imagetracer: ImageTracer;
  export default imagetracer;
}
