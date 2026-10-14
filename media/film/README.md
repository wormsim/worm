# The 30-second film

`film.html` draws every frame on a canvas from the real engine's numbers (the
pinned run's population and generations, a Red vs Blue day's R, real sealed
hashes). `capture.js` renders the 900 frames with Playwright; ffmpeg adds a
synthesized sound design and encodes the MP4.

```bash
# 1. export the engine data the film reads (data.json next to film.html)
# 2. frames
node capture.js "$(pwd)" frames
# 3. encode (see the commands in the session notes: sound.wav is generated with ffmpeg aevalsrc)
ffmpeg -framerate 30 -i frames/f%04d.jpg -i sound.wav -t 30 -c:v libx264 -crf 16 -pix_fmt yuv420p -c:a aac worm-promo.mp4
```

Fonts: Archivo and IBM Plex Mono (SIL OFL), placed next to `film.html` as `archivo.woff2` and `plex500.woff2`.
