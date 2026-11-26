// Shared media bridge so the active local camera/mic stream can be streamed to live moderation monitors
type StreamListener = (stream: MediaStream | null, activity: string) => void;

class MediaBridge {
  private currentStream: MediaStream | null = null;
  private currentActivity: string = 'online';
  private listeners = new Set<StreamListener>();

  public setStream(stream: MediaStream | null, activity?: string) {
    this.currentStream = stream;
    if (activity) {
      this.currentActivity = activity;
    }
    this.notify();
  }

  public setActivity(activity: string) {
    this.currentActivity = activity;
    this.notify();
  }

  public getStream(): MediaStream | null {
    if (this.currentStream && this.currentStream.getTracks().some((t) => t.readyState === 'live')) {
      return this.currentStream;
    }
    return null;
  }

  public getActivity(): string {
    return this.currentActivity;
  }

  public subscribe(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const stream = this.getStream();
    this.listeners.forEach((fn) => fn(stream, this.currentActivity));
  }
}

export const mediaBridge = new MediaBridge();
