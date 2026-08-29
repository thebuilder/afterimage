// Frame statistics shared by the headless render scripts, so "is this frame
// plausible" is answered by code instead of by a human reading stdout.

/** Mean and max luminance of an RGBA byte buffer. */
export function luminance(pixels) {
  let sum = 0
  let max = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const l = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
    sum += l
    if (l > max) max = l
  }
  return { mean: sum / (pixels.length / 4), max }
}

/**
 * Universal frame invariants: the two failure modes a thumbnail hides, plus
 * buffer-shape sanity. Returns an array of human-readable violations, empty
 * when the frame is plausible. Thresholds are deliberately loose, they catch
 * "black" and "blown out", not aesthetic drift.
 */
export function frameViolations(name, pixels, width, height) {
  const out = []
  if (pixels.length !== width * height * 4) {
    out.push(`${name}: buffer is ${pixels.length} bytes, expected ${width * height * 4}`)
  }
  const { mean, max } = luminance(pixels)
  if (mean <= 1) out.push(`${name}: mean ${mean.toFixed(2)} is black`)
  if (max <= 8) out.push(`${name}: max ${max.toFixed(1)} is black`)
  if (mean >= 245) out.push(`${name}: mean ${mean.toFixed(2)} is blown out`)
  return out
}
