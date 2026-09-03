Real-ESRGAN, Modell «realesr-general-x4v3» (Architektur SRVGGNetCompact, 64 Merkmale,
32 Faltungsschichten, 4-fach), aus dem Release v0.2.5.0 von
https://github.com/xinntao/Real-ESRGAN (BSD-3-Clause, siehe LICENSE.txt).

general.bin   realesr-general-x4v3.pth       (ohne Rauschunterdrückung)
wdn.bin       realesr-general-wdn-x4v3.pth   (mit Rauschunterdrückung, «wdn»)
manifest.json Schichtenfolge und Offsets; beide Dateien haben dasselbe Layout,
              die «Glättung» der App mischt die beiden Gewichtssätze linear
              (entspricht dem Parameter denoise_strength des Originals).

Umgewandelt mit convert.py (ohne PyTorch): Faltungsgewichte als [kh, kw, in, out],
Ausgangskanäle der letzten Faltung in die Reihenfolge von tf.depthToSpace (NHWC)
gebracht. Eingabe und Ausgabe im Bereich 0–1.

x4plus.bin / x4plus.json
  RealESRGAN_x4plus (RRDBNet, 64 Merkmale, 23 RRDB-Blöcke, 16.7 Mio. Parameter) aus
  Release v0.1.0, als Float16 gespeichert (33 MB) und im Browser zu Float32 entpackt.
  Umgewandelt mit convert_rrdb.py; Tensoren nach Namen mit Offset im Manifest.
