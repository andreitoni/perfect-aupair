"use client";

type MessageVideoProps = {
  src: string;
  isOwnMessage: boolean;
};

export function MessageVideo({ src, isOwnMessage }: MessageVideoProps) {
  return (
    <video
      data-message-video="true"
      src={src}
      controls
      preload="none"
      playsInline
      controlsList="nodownload"
      disablePictureInPicture
      draggable={false}
      className="pa-protected-media block aspect-[4/5] w-[180px] max-w-[62vw] rounded-[20px] bg-black object-contain"
      style={{
        marginLeft: isOwnMessage ? "auto" : "0",
      }}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
