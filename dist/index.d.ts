declare global {
    interface Window {
        AudioContext: AudioContext;
        webkitAudioContext: any;
        VideoStreamMerger: VideoStreamMerger;
    }
    interface AudioContext {
        createGainNode: any;
    }
    interface HTMLCanvasElement {
        captureStream(frameRate?: number): MediaStream;
    }
    interface HTMLMediaElement {
        _mediaElementSource: any;
    }
}
export declare class VideoStreamMerger {
    width: number;
    height: number;
    fps: number;
    private _streams;
    private _frameCount;
    clearRect?: (x: number, y: number, width: number, height: number) => void;
    started: boolean;
    result: MediaStream | null;
    supported: boolean | null;
    private _canvas;
    private _ctx;
    private _videoSyncDelayNode;
    private _audioDestination;
    private _audioCtx;
    constructor(opts?: any);
    setOptions(opts?: any): void;
    setOutputSize(width: number, height: number): void;
    getAudioContext(): AudioContext | null;
    getAudioDestination(): MediaStreamAudioDestinationNode | null;
    getCanvasContext(): CanvasRenderingContext2D | null;
    _backgroundAudioHack(): void;
    _setupConstantNode(): void;
    _createConstantSource(): ConstantSourceNode | AudioBufferSourceNode | undefined;
    updateIndex(mediaStream: MediaStream | string | {
        id: string;
    }, index: number): void;
    _sortStreams(): void;
    addMediaElement(id: string, element: HTMLMediaElement, opts: any): void;
    addStream(mediaStream: MediaStream | string, opts?: any): void;
    removeStream(mediaStream: MediaStream | string | {
        id: string;
    }): void;
    _addData(key: string, opts: any): void;
    _requestAnimationFrame(callback: any): void;
    start(): void;
    _updateAudioDelay(delayInMs: number): void;
    _draw(): void;
    _drawVideo(element: HTMLVideoElement, stream: any): void;
    stop(): void;
}
