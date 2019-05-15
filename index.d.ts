export as namespace VideoStreamMerger;

export = VideoStreamMerger;

/**
 * Merges the video of multiple MediaStreams. Also merges the audio via the WebAudio API.
 *
 * - Send multiple videos over a single WebRTC MediaConnection
 * - Hotswap streams without worrying about renegotation or delays
 * - Crop, scale, and rotate live video
 * - Add crazy effects through the canvas API
 */
declare class VideoStreamMerger {
  /**
   * Create a new VideoStreamMerger
   */
  constructor(options?: Partial<VideoStreamMerger.ConstructorOptions>);

  /**
   * The resulting merged MediaStream. Only available after calling merger.start()
   * Never has more than one Audio and one Video track.
   */
  result: MediaStream;

  /**
   * Add a MediaStream to be merged. Use an id string if you only want to provide an effect.
   * The order that streams are added matters. Streams placed earlier will be behind later streams (use the index option to change this behaviour.)
   */
  addStream(
    stream: MediaStream | string,
    options?: Partial<VideoStreamMerger.AddStreamOptions>
  ): void;

  /**
   * A convenience function to merge a HTML5 MediaElement instead of a MediaStream.
   *
   * id is a string used to remove or update the index of the stream later.
   * mediaElement is a playing HTML5 Audio or Video element.
   * options are identical to the opts for addStream.
   * Streams from MediaElements can be removed via merger.removeStream(id).
   */
  addMediaElement(
    id: string,
    mediaElement: HTMLMediaElement,
    options?: Partial<VideoStreamMerger.AddStreamOptions>
  ): void;

  /**
   * Update the z-index (draw order) of an already added stream or data object. Identical to the index option.
   * If you have added the same MediaStream multiple times, all instances will be updated.
   */
  updateIndex(stream: MediaStream | string, newIndex: number): void;

  /**
   * Remove a MediaStream from the merging. You may also use the ID of the stream.
   * If you have added the same MediaStream multiple times, all instances will be removed.
   */
  removeStream(stream: MediaStream | string): void;

  /**
   * Start the merging and create merger.result.
   * You can call this any time, but you only need to call it once.
   * You will still be able to add/remove streams and the result stream will automatically update.
   */
  start(): void;

  /**
   * Clean up everything and destroy the result stream.
   */
  destroy(): void;

  /**
   * Get the WebAudio AudioContext being used by the merger.
   */
  getAudioContext(): AudioContext;

  /**
   * Get the MediaStreamDestination node that is used by the merger.
   */
  getAudioDestination(): MediaStreamAudioDestinationNode;
}

declare namespace VideoStreamMerger {
  export interface DrawFunction {
    (
      context: CanvasRenderingContext2D,
      frame: CanvasImageSource,
      done: () => void
    ): void;
  }

  export interface AudioEffect {
    (
      sourceNode: AudioNode,
      destinationNode: MediaStreamAudioDestinationNode
    ): void;
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
    draw: DrawFunction;
    audioEffect: AudioEffect;
  }
}
