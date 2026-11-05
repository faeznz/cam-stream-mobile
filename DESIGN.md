# Camera dashboard

Direction: extend the existing light dashboard and blue action palette into a
responsive camera-monitoring screen, as requested in the multi-device update.

- Audience: an operator registering Android phones and viewing their cameras.
- ENERGY 1 / RHYTHM 1 / MOTION 1. Stable controls and a repeatable camera grid
  let moving video carry the visual emphasis.
- Light shell and system sans-serif retain the existing application identity;
  slate text separates names, status, and device IDs by importance.
- Blue marks registration and starting streams; red is reserved for stopping
  a camera or reporting a connection error. Status always has a text label.
- Dark video surfaces separate the live image from surrounding controls and
  preserve contrast around both portrait and landscape feeds.
- One/two/three equal camera columns support comparing devices at phone,
  tablet, and desktop widths. Each video retains its full image without cropping.
- Inline setup instructions keep the download and connection address beside
  the device list. No overlay or new navigation destination is needed.
- Camera glyphs identify an inactive video surface. Numbering follows the
  actual device list and provides an additional way to distinguish cameras.
- Cards group one independently controlled physical device. Subtle borders,
  rather than elevated shadows or animation, separate these groups.

## Android controller

The phone screen follows the same light/system-font palette. Larger 16–17sp body
text and 50–54dp controls make connection settings and background permissions
readable on the connected Samsung device. A scrollable, keyboard-resizing form
keeps controls reachable at large system font settings. The status card reports
the native service state rather than the visibility of the app screen. Battery
permission has its own section because it is a real prerequisite for reliable
background operation on restricted devices. Active and error states retain text
labels; no animation or color-only signal is used.
