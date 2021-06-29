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
    _mediaElementSource: any
  }
  interface HTMLVideoElement {
    playsInline: boolean;
  }
}

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
  muted: boolean;
  draw: DrawFunction;
  audioEffect: AudioEffect;
}

export class VideoStreamMerger {

  /**
   * Width of the merged MediaStream
   */
  public width = 720;

  /**
   * Height of the merged MediaStream
   */
  public height = 405;
  public fps = 25;
  private _streams: any[] = [];
  private _frameCount = 0;

  public clearRect = true;
  public started = false;

  /**
   * The resulting merged MediaStream. Only available after calling merger.start()
   * Never has more than one Audio and one Video track.
   */
  public result: MediaStream | null = null;
  public supported: boolean | null = null;

  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _videoSyncDelayNode: DelayNode | null = null;
  private _audioDestination: MediaStreamAudioDestinationNode | null = null;
  private _audioCtx: AudioContext | null = null;

  constructor(options?: ConstructorOptions | undefined) {

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioSupport = !!(window.AudioContext && (new AudioContext()).createMediaStreamDestination);
    const canvasSupport = !!document.createElement('canvas').captureStream;
    const supported = this.supported =  audioSupport && canvasSupport;

    if (!supported) {
      return;
    }

    this.setOptions(options);

    const audioCtx = this._audioCtx = new AudioContext();
    const audioDestination = this._audioDestination = audioCtx?.createMediaStreamDestination();

    // delay node for video sync
    this._videoSyncDelayNode = audioCtx.createDelay(5.0);
    this._videoSyncDelayNode.connect(audioDestination);

    this._setupConstantNode(); // HACK for wowza #7, #10

    this.started = false;
    this.result = null;

    this._backgroundAudioHack();
  }

  setOptions(options?: ConstructorOptions | undefined): void {
    options = options || {} as ConstructorOptions;
    this._audioCtx = (options.audioContext || new AudioContext());
    this.width = options.width || this.width;
    this.height = options.height || this.width;
    this.fps = options.fps || this.fps;
    this.clearRect = options.clearRect === undefined ? true : options.clearRect;
  }

  /**
   * Change the size of the canvas and the output video track.
   */
  setOutputSize(width:number, height: number): void {
    this.width = width;
    this.height = height;

    if (this._canvas) {
      this._canvas.setAttribute('width', this.width.toString());
      this._canvas.setAttribute('height', this.height.toString());
    }
  }

  /**
   * Get the WebAudio AudioContext being used by the merger.
   */
  getAudioContext(): AudioContext | null {
    return this._audioCtx;
  }

  /**
   * Get the MediaStreamDestination node that is used by the merger.
   */
  getAudioDestination(): MediaStreamAudioDestinationNode | null {
    return this._audioDestination;
  }

  getCanvasContext(): CanvasRenderingContext2D | null {
    return this._ctx;
  }

  private _backgroundAudioHack() {
    if (this._audioCtx) {
      // stop browser from throttling timers by playing almost-silent audio
      const source = this._createConstantSource();
      const gainNode = this._audioCtx.createGain();
      if (gainNode && source) {
        gainNode.gain.value = 0.001; // required to prevent popping on start
        source.connect(gainNode);
        gainNode.connect(this._audioCtx.destination);
        source.start();
      }
    }
  }

  private _setupConstantNode() {
    if (this._audioCtx && this._videoSyncDelayNode) {
      const constantAudioNode = this._createConstantSource();

      if (constantAudioNode) {
        constantAudioNode.start();

        const gain = this._audioCtx.createGain(); // gain node prevents quality drop
        gain.gain.value = 0;

        constantAudioNode.connect(gain);
        gain.connect(this._videoSyncDelayNode);
      }
    }
  }

  private _createConstantSource() {

    if (this._audioCtx) {
      if (this._audioCtx.createConstantSource) {
        return this._audioCtx.createConstantSource();
      }

      // not really a constantSourceNode, just a looping buffer filled with the offset value
      const constantSourceNode = this._audioCtx.createBufferSource();
      const constantBuffer = this._audioCtx.createBuffer(1, 1, this._audioCtx.sampleRate);
      const bufferData = constantBuffer.getChannelData(0);
      bufferData[0] = (0 * 1200) + 10;
      constantSourceNode.buffer = constantBuffer;
      constantSourceNode.loop = true;

      return constantSourceNode;
    }
  }

  /**
   * Update the z-index (draw order) of an already added stream or data object. Identical to the index option.
   * If you have added the same MediaStream multiple times, all instances will be updated.
   */
  updateIndex(mediaStream: MediaStream | string | {id: string}, index: number): void {
    if (typeof mediaStream === 'string') {
      mediaStream = {
        id: mediaStream
      };
    }

    index = index == null ? 0 : index;

    for (let i = 0; i < this._streams.length; i++) {
      if (mediaStream.id === this._streams[i].id) {
        this._streams[i].index = index;
      }
    }
    this._sortStreams();
  }

  private _sortStreams() {
    this._streams = this._streams.sort((a, b) => a.index - b.index);
  }

  /**
   * A convenience function to merge a HTML5 MediaElement instead of a MediaStream.
   *
   * id is a string used to remove or update the index of the stream later.
   * mediaElement is a playing HTML5 Audio or Video element.
   * options are identical to the opts for addStream.
   * Streams from MediaElements can be removed via merger.removeStream(id).
   */
  addMediaElement(id: string, element: HTMLMediaElement, opts: any): void {
    opts = opts || {};

    opts.x = opts.x || 0;
    opts.y = opts.y || 0;
    opts.width = opts.width || this.width;
    opts.height = opts.height || this.height;
    opts.mute = opts.mute || opts.muted || false;

    opts.oldDraw = opts.draw;
    opts.oldAudioEffect = opts.audioEffect;

    if (
      element instanceof HTMLVideoElement ||
      element instanceof HTMLImageElement
    ) {
      opts.draw = (ctx: CanvasRenderingContext2D, _: any, done: () => void) => {
        if (opts.oldDraw) {
          opts.oldDraw(ctx, element, done);
        } else {
          // default draw function
          const width = opts.width == null ? this.width : opts.width;
          const height = opts.height == null ? this.height : opts.height;
          ctx.drawImage(element, opts.x, opts.y, width, height);
          done();
        }
      };
    } else {
      opts.draw = null;
    }

    if (this._audioCtx && !opts.mute) {
      const audioSource = element._mediaElementSource || this._audioCtx.createMediaElementSource(element);
      element._mediaElementSource = audioSource; // can only make one source per element, so store it for later (ties the source to the element's garbage collection)
      audioSource.connect(this._audioCtx.destination); // play audio from original element

      const gainNode = this._audioCtx.createGain();
      audioSource.connect(gainNode);
      if (
        (
          element instanceof HTMLVideoElement ||
          element instanceof HTMLAudioElement
        ) && element.muted
      ) {
        // keep the element "muted" while having audio on the merger
        element.muted = false;
        element.volume = 0.001;
        gainNode.gain.value = 1000;
      } else {
        gainNode.gain.value = 1;
      }
      opts.audioEffect = (_: any, destination: AudioNode) => {
        if (opts.oldAudioEffect) {
          opts.oldAudioEffect(gainNode, destination);
        } else {
          gainNode.connect(destination);
        }
      };
      opts.oldAudioEffect = null;
    }

    this.addStream(id, opts);
  }

  /**
   * Add a MediaStream to be merged. Use an id string if you only want to provide an effect.
   * The order that streams are added matters. Streams placed earlier will be behind later streams (use the index option to change this behaviour.)
   */
  addStream(mediaStream: MediaStream | string, opts: AddStreamOptions | undefined): void {

    if (typeof mediaStream === 'string') {
      return this._addData(mediaStream, opts);
    }

    opts = opts || {} as AddStreamOptions;
    const stream: any = {};

    stream.isData = false;
    stream.x = opts.x || 0;
    stream.y = opts.y || 0;
    stream.width = opts.width;
    stream.height = opts.height;
    stream.draw = opts.draw || null;
    stream.mute = opts.mute || opts.muted || false;
    stream.audioEffect = opts.audioEffect || null;
    stream.index = opts.index == null ? 0 : opts.index;
    stream.hasVideo = mediaStream.getVideoTracks().length > 0;
    stream.hasAudio = mediaStream.getAudioTracks().length > 0;

    // If it is the same MediaStream, we can reuse our video element (and ignore sound)
    let videoElement : HTMLVideoElement | null = null;
    for (let i = 0; i < this._streams.length; i++) {
      if (this._streams[i].id === mediaStream.id) {
        videoElement = this._streams[i].element;
      }
    }

    if (!videoElement) {
      videoElement = document.createElement('video');
      videoElement.autoplay = true;
      videoElement.muted = true;
      videoElement.playsInline = true;
      videoElement.srcObject = mediaStream;
      videoElement.setAttribute('style', 'position:fixed; left: 0px; top:0px; pointer-events: none; opacity:0;');
      document.body.appendChild(videoElement);

      const res = videoElement.play();
      res.catch(null);

      if (stream.hasAudio && this._audioCtx && !stream.mute) {
        stream.audioSource = this._audioCtx.createMediaStreamSource(mediaStream);
        stream.audioOutput = this._audioCtx.createGain(); // Intermediate gain node
        stream.audioOutput.gain.value = 1;
        if (stream.audioEffect) {
          stream.audioEffect(stream.audioSource, stream.audioOutput);
        } else {
          stream.audioSource.connect(stream.audioOutput); // Default is direct connect
        }
        stream.audioOutput.connect(this._videoSyncDelayNode);
      }
    }

    stream.element = videoElement;
    stream.id = mediaStream.id || null;
    this._streams.push(stream);
    this._sortStreams();
  }

  /**
   * Remove a MediaStream from the merging. You may also use the ID of the stream.
   * If you have added the same MediaStream multiple times, all instances will be removed.
   */
  removeStream(mediaStream: MediaStream | string | {id: string}): void {
    if (typeof mediaStream === 'string') {
      mediaStream = {
        id: mediaStream
      };
    }

    for (let i = 0; i < this._streams.length; i++) {
      const stream = this._streams[i];
      if (mediaStream.id === stream.id) {
        if (stream.audioSource) {
          stream.audioSource = null;
        }
        if (stream.audioOutput) {
          stream.audioOutput.disconnect(this._videoSyncDelayNode);
          stream.audioOutput = null;
        }
        if (stream.element) {
          stream.element.remove();
        }
        this._streams[i] = null;
        this._streams.splice(i, 1);
        i--;
      }
    }
  }

  private _addData(key: string, opts: any) {
    opts = opts || {};
    const stream: any = {};

    stream.isData = true;
    stream.draw = opts.draw || null;
    stream.audioEffect = opts.audioEffect || null;
    stream.id = key;
    stream.element = null;
    stream.index = opts.index == null ? 0 : opts.index;

    if (this._videoSyncDelayNode && this._audioCtx && stream.audioEffect) {
      stream.audioOutput = this._audioCtx.createGain(); // Intermediate gain node
      stream.audioOutput.gain.value = 1;
      stream.audioEffect(null, stream.audioOutput);
      stream.audioOutput.connect(this._videoSyncDelayNode);
    }

    this._streams.push(stream);
    this._sortStreams();
  }

  // Wrapper around requestAnimationFrame and setInterval to avoid background throttling
  private _requestAnimationFrame(callback: () => void) {
    let fired = false;
    const interval = setInterval(() => {
      if (!fired && document.hidden) {
        fired = true;
        clearInterval(interval);
        callback();
      }
    }, 1000 / this.fps);
    requestAnimationFrame(() => {
      if (!fired) {
        fired = true;
        clearInterval(interval);
        callback();
      }
    });
  }

  /**
   * Start the merging and create merger.result.
   * You can call this any time, but you only need to call it once.
   * You will still be able to add/remove streams and the result stream will automatically update.
   */
  start(): void {

    // Hidden canvas element for merging
    this._canvas = document.createElement('canvas');
    this._canvas.setAttribute('width', this.width.toString());
    this._canvas.setAttribute('height', this.height.toString());
    this._canvas.setAttribute('style', 'position:fixed; left: 110%; pointer-events: none'); // Push off screen
    this._ctx = this._canvas.getContext('2d');

    this.started = true;
    this._requestAnimationFrame(this._draw.bind(this));

    // Add video
    this.result = this._canvas?.captureStream(this.fps) || null;

    // Remove "dead" audio track
    const deadTrack = this.result?.getAudioTracks()[0];
    if (deadTrack) {this.result?.removeTrack(deadTrack);}

    // Add audio
    const audioTracks = this._audioDestination?.stream.getAudioTracks();
    if (audioTracks && audioTracks.length) {
      this.result?.addTrack(audioTracks[0]);
    }
  }

  private _updateAudioDelay(delayInMs: number) {
    if (this._videoSyncDelayNode && this._audioCtx) {
      this._videoSyncDelayNode.delayTime.setValueAtTime(delayInMs / 1000, this._audioCtx.currentTime);
    }
  }

  private _draw() {
    if (!this.started) {return;}

    this._frameCount++;

    // update video processing delay every 60 frames
    let t0  = 0;
    if (this._frameCount % 60 === 0) {
      t0 = performance.now();
    }

    let awaiting = this._streams.length;
    const done = () => {
      awaiting--;
      if (awaiting <= 0) {
        if (this._frameCount % 60 === 0) {
          const t1 = performance.now();
          this._updateAudioDelay(t1 - t0);
        }
        this._requestAnimationFrame(this._draw.bind(this));
      }
    };

    if (this.clearRect) {
      this._ctx?.clearRect(0, 0, this.width, this.height);
    }
    this._streams.forEach((stream) => {
      if (stream.draw) { // custom frame transform
        stream.draw(this._ctx, stream.element, done);
      } else if (!stream.isData && stream.hasVideo) {
        this._drawVideo(stream.element, stream);
        done();
      } else {
        done();
      }
    });

    if (this._streams.length === 0) {
      done();
    }
  }

  private _drawVideo(element: HTMLVideoElement, stream: any) {

    // default draw function

    const canvasHeight = this.height;
    const canvasWidth = this.width;

    const height = stream.height || element.videoHeight || canvasHeight;
    const width = stream.width || element.videoWidth || canvasWidth;

    let positionX = stream.x || 0;
    let positionY = stream.Y || 0;

    // TODO move to sreeam option to enable new behavior
    const keepRatio = false;

    if (!keepRatio) {

      try {
          this._ctx?.drawImage(element, positionX, positionY, width, height);
      } catch (err) {
        // Ignore error possible "IndexSizeError (DOM Exception 1): The index is not in the allowed range." due Safari bug.
        console.error(err);
      }
    } else {

      const ratio  = Math.min ( canvasHeight / height, canvasWidth / width);

      positionX = ( canvasWidth - width * ratio ) / 2;
      positionY = ( canvasHeight - height * ratio ) / 2;

      try {
        this._ctx?.drawImage(element, 0, 0, width, height, positionX, positionY, width*ratio, height*ratio);
      } catch (err) {
        // Ignore error possible "IndexSizeError (DOM Exception 1): The index is not in the allowed range." due Safari bug.
        console.error(err);
      }
    }
  }

  /**
   * Clean up everything and destroy the result stream.
   */
  stop(): void {
    this.started = false;

    this._canvas = null;
    this._ctx = null;
    this._streams.forEach(stream => {
      if (stream.element) {
        stream.element.remove();
      }
    });
    this._streams = [];
    this._audioCtx?.close();
    this._audioCtx = null;
    this._audioDestination = null;
    this._videoSyncDelayNode = null;

    this.result?.getTracks().forEach((t) => {
      t.stop();
    });

    this.result = null;
  }
}

if (typeof window !== "undefined") {
    (window as any).VideoStreamMerger = VideoStreamMerger;
}

