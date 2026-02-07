export interface Song {
    id: string;
    title: string;
    videoId: string;
    vttUrl?: string;
    lyricsUrl?: string;
    coverUrl?: string;
}

export const songs: Song[] = [
    {
        id: "wumeizijiang",
        title: "나랑아니면(who do you love)",
        videoId: "0dRo5Kbgx6c",
        vttUrl: "https://dohoonidot.github.io/forBelle/lyrics.vtt",
        coverUrl: "./images/whodoyoulove.jpg",
    },
    {
        id: "littleworld",
        title: "그대작은나의 세상이 되어 (You become my little world)",
        videoId: "hmP2yQoFrLM",
        vttUrl: "./littleworld.vtt",
        coverUrl: "./images/littleworld.jpg",
    }
];
