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
    interface HTMLVideoElement {
        playsInline: boolean;
    }
}
export interface DrawFunction {
    (context: CanvasRenderingContext2D, frame: CanvasImageSource, done: () => void): void;
}
export interface AudioEffect {
    (sourceNode: AudioNode, destinationNode: MediaStreamAudioDestinationNode): void;
}
export interface ConstructorOptions {
    width: number;
    height: number;
    fps: number;
    clearRect: boolean;
    audioContext: AudioContext;
}
export interface AddStreamOptions {
    x: number;
    y: number;
    width: number;
    height: number;
    index: number;
    mute: boolean;
    muted: boolean;
    draw: DrawFunction;
    audioEffect: AudioEffect;
}
/**
 * Merges the video of multiple MediaStreams. Also merges the audio via the WebAudio API.
 *
 * - Send multiple videos over a single WebRTC MediaConnection
 * - Hotswap streams without worrying about renegotation or delays
 * - Crop, scale, and rotate live video
 * - Add crazy effects through the canvas API
 */
export declare class VideoStreamMerger {
    /**
     * Width of the merged MediaStream
     */
    width: number;
    /**
     * Height of the merged MediaStream
     */
    height: number;
    fps: number;
    private _streams;
    private _frameCount;
    clearRect: boolean;
    started: boolean;
    /**
     * The resulting merged MediaStream. Only available after calling merger.start()
     * Never has more than one Audio and one Video track.
     */
    result: MediaStream | null;
    supported: boolean | null;
    private _canvas;
    private _ctx;
    private _videoSyncDelayNode;
    private _audioDestination;
    private _audioCtx;
    constructor(options?: ConstructorOptions | undefined);
    setOptions(options?: ConstructorOptions | undefined): void;
    /**
     * Change the size of the canvas and the output video track.
     */
    setOutputSize(width: number, height: number): void;
    /**
     * Get the WebAudio AudioContext being used by the merger.
     */
    getAudioContext(): AudioContext | null;
    /**
     * Get the MediaStreamDestination node that is used by the merger.
     */
    getAudioDestination(): MediaStreamAudioDestinationNode | null;
    getCanvasContext(): CanvasRenderingContext2D | null;
    private _backgroundAudioHack;
    private _setupConstantNode;
    private _createConstantSource;
    /**
     * Update the z-index (draw order) of an already added stream or data object. Identical to the index option.
     * If you have added the same MediaStream multiple times, all instances will be updated.
     */
    updateIndex(mediaStream: MediaStream | string | {
        id: string;
    }, index: number): void;
    private _sortStreams;
    /**
     * A convenience function to merge a HTML5 MediaElement instead of a MediaStream.
     *
     * id is a string used to remove or update the index of the stream later.
     * mediaElement is a playing HTML5 Audio or Video element.
     * options are identical to the opts for addStream.
     * Streams from MediaElements can be removed via merger.removeStream(id).
     */
    addMediaElement(id: string, element: HTMLMediaElement, opts: any): void;
    /**
     * Add a MediaStream to be merged. Use an id string if you only want to provide an effect.
     * The order that streams are added matters. Streams placed earlier will be behind later streams (use the index option to change this behaviour.)
     */
    addStream(mediaStream: MediaStream | string, opts: AddStreamOptions | undefined): void;
    /**
     * Remove a MediaStream from the merging. You may also use the ID of the stream.
     * If you have added the same MediaStream multiple times, all instances will be removed.
     */
    removeStream(mediaStream: MediaStream | string | {
        id: string;
    }): void;
    private _addData;
    private _requestAnimationFrame;
    /**
     * Start the merging and create merger.result.
     * You can call this any time, but you only need to call it once.
     * You will still be able to add/remove streams and the result stream will automatically update.
     */
    start(): void;
    private _updateAudioDelay;
    private _draw;
    private _drawVideo;
    /**
     * Clean up everything and destroy the result stream.
     */
    stop(): void;
    destroy(): void;
}
