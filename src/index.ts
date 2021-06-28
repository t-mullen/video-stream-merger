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
}

export class VideoStreamMerger {

  public width = 720;
  public height = 405;
  public fps = 25;
  private _streams: any[] = [];
  private _frameCount = 0;

  public clearRect?: (x: number, y: number, width: number, height: number) => void;
  public started = false;
  public result: MediaStream | null = null;
  public supported: boolean | null = null;

  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _videoSyncDelayNode: DelayNode | null = null;
  private _audioDestination: MediaStreamAudioDestinationNode | null = null;
  private _audioCtx: AudioContext | null = null;

  constructor(opts?: any) {

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioSupport = !!(window.AudioContext && (new AudioContext()).createMediaStreamDestination);
    const canvasSupport = !!document.createElement('canvas').captureStream;
    const supported = this.supported =  audioSupport && canvasSupport;

    if (!supported) {
      return;
    }

    this.setOptions(opts);

    // Hidden canvas element for merging
    const canvas = this._canvas = document.createElement('canvas');
    canvas.setAttribute('width', this.width.toString());
    canvas.setAttribute('height', this.height.toString());
    canvas.setAttribute('style', 'position:fixed; left: 110%; pointer-events: none'); // Push off screen
    this._ctx = canvas.getContext('2d');


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

  setOptions(opts?: any) {
    opts = opts || {};
    this._audioCtx = (opts.audioContext || new AudioContext());
    this.width = opts.width || this.width;
    this.height = opts.height || this.width;
    this.fps = opts.fps || this.fps;
    this.clearRect = opts.clearRect === undefined ? true : opts.clearRect;
  }

  setOutputSize(width:number, height: number) {
    this.width = width;
    this.height = height;

    if (this._canvas) {
      this._canvas.setAttribute('width', this.width.toString());
      this._canvas.setAttribute('height', this.height.toString());
    }
  }

  getAudioContext() {
    return this._audioCtx;
  }

  getAudioDestination() {
    return this._audioDestination;
  }

  getCanvasContext() {
    return this._ctx;
  }

  _backgroundAudioHack() {
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

  _setupConstantNode() {
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

  _createConstantSource() {

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

  updateIndex(mediaStream: MediaStream | string | {id: string}, index: number) {
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

  _sortStreams() {
    this._streams = this._streams.sort((a, b) => a.index - b.index);
  }

  // convenience function for adding a media element
  addMediaElement(id: string, element: HTMLMediaElement, opts: any) {
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

  addStream(mediaStream: MediaStream | string, opts?: any) {

    if (typeof mediaStream === 'string') {
      return this._addData(mediaStream, opts);
    }

    opts = opts || {};
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

    // If it is the same MediaStream, we can reuse our video element (and ignore sound)
    let videoElement = null;
    for (let i = 0; i < this._streams.length; i++) {
      if (this._streams[i].id === mediaStream.id) {
        videoElement = this._streams[i].element;
      }
    }

    if (!videoElement) {
      videoElement = document.createElement('video');
      videoElement.autoplay = true;
      videoElement.muted = true;
      videoElement.srcObject = mediaStream;
      videoElement.setAttribute('style', 'position:fixed; left: 0px; top:0px; pointer-events: none; opacity:0;');
      document.body.appendChild(videoElement);

      if (this._audioCtx && !stream.mute) {
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

  removeStream(mediaStream: MediaStream | string | {id: string}) {
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

  _addData(key: string, opts: any) {
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
  _requestAnimationFrame(callback: any) {
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

  start() {
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

  _updateAudioDelay(delayInMs: number) {
    if (this._videoSyncDelayNode && this._audioCtx) {
      this._videoSyncDelayNode.delayTime.setValueAtTime(delayInMs / 1000, this._audioCtx.currentTime);
    }
  }

  _draw() {
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

  _drawVideo(element: HTMLVideoElement, stream: any) {

      // default draw function
      const canvasSize = { height: this.height, width: this.width};

      const position = {
        x: stream.x || 0,
        y: stream.y || 0
      };

      const size = {
          height: stream.height || element.videoHeight || canvasSize.height,
          width: stream.width || element.videoWidth || canvasSize.width
      };

      const sizeRatio = {
        width: canvasSize.width / size.width,
        height: canvasSize.height / size.height,
      };

      const ratio  = Math.min ( sizeRatio.height, sizeRatio.width);

      position.x = ( canvasSize.width - size.width * ratio ) / 2;
      position.y = ( canvasSize.height - size.height * ratio ) / 2;

    try {
      this._ctx?.drawImage(element, 0, 0, size.width, size.height, position.x, position.y, size.width*ratio, size.height*ratio);
    } catch {
      // Ignore error
    }
  }

  stop() {
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

