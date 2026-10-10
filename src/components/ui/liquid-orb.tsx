import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { cn } from '@/lib/utils';

declare const GPUBufferUsage: {
  MAP_READ: number;
  MAP_WRITE: number;
  COPY_SRC: number;
  COPY_DST: number;
  INDEX: number;
  VERTEX: number;
  UNIFORM: number;
  STORAGE: number;
  INDIRECT: number;
  QUERY_RESOLVE: number;
};

declare const GPUTextureUsage: {
  COPY_SRC: number;
  COPY_DST: number;
  TEXTURE_BINDING: number;
  STORAGE_BINDING: number;
  RENDER_ATTACHMENT: number;
};

export interface LiquidOrbHandle {
  setState: (state: 'idle' | 'thinking') => void;
  setAudioBands: (bands: { low?: number; mid?: number; high?: number; all?: number }) => void;
  getState: () => 'idle' | 'thinking';
}

export interface LiquidOrbProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: 'idle' | 'thinking';
  isListening?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'hero' | string;
  className?: string;
  audioBands?: { low?: number; mid?: number; high?: number; all?: number };
}

// ── WebGPU Shader (WGSL) ────────────────────────────────────────────────────────
const shaderSource = `
struct Uniforms {
  size:           vec2<f32>,
  time:           f32,
  speed:          f32,
  radius:         f32,
  zoom:           f32,
  warp:           f32,
  ridgeAmt:       f32,
  sharp:          f32,
  shade:          f32,
  sheen:          f32,
  gloss:          f32,
  shellMidAlpha:  f32,
  shellEdgeAlpha: f32,
  exposure:       f32,
  style:          f32,
  edgeSoftness:   f32,
  edgeGlow:       f32,
  paletteCount:   f32,
  glassEnabled:   f32,
  glassOpacity:   f32,
  contourDeform:  f32,
  bandDensity:    f32,
  chromaticShift: f32,
  metalScale:     f32,
  metalStretch:   f32,
  metalAngle:     f32,
  metalOffset:    f32,
  metalPhase:     f32,
  metalEvolution: f32,
  metalRoughness: f32,
  metalDepth:     f32,
  particleDensity: f32,
  ribbonCount:     f32,
  ribbonWidth:     f32,
  ribbonTwist:     f32,
  ribbonFold:      f32,
  ribbonBreath:    f32,
  particleSize:    f32,
  particleBloom:   f32,
  colorA:         vec4<f32>,
  colorB:         vec4<f32>,
  colorC:         vec4<f32>,
  colorD:         vec4<f32>,
  highlightColor: vec4<f32>,
  shellInner:     vec4<f32>,
  shellMid:       vec4<f32>,
  shellEdge:      vec4<f32>,
  sheenColor:     vec4<f32>,
  specColor:      vec4<f32>,
  canvasColor:    vec4<f32>,
  glowColor:      vec4<f32>,
  paletteStop0:    vec4<f32>,
  paletteStop1:    vec4<f32>,
  paletteStop2:    vec4<f32>,
  paletteStop3:    vec4<f32>,
  paletteStop4:    vec4<f32>,
  paletteStop5:    vec4<f32>,
  paletteStop6:    vec4<f32>,
  paletteStop7:    vec4<f32>,
  paletteStop8:    vec4<f32>,
  paletteStop9:    vec4<f32>,
  paletteStop10:   vec4<f32>,
  paletteStop11:   vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn mfEdgeD(soft: f32) -> f32 {
  return soft - 0.005;
}

fn mfEdgeGlow(col: vec3<f32>, uv: vec2<f32>, ctr: vec2<f32>, rad: f32,
              soft: f32, glow: f32, glowRGB: vec3<f32>) -> vec3<f32> {
  if (glow <= 0.0) { return col; }
  let r = length(uv - ctr);
  let outside = smoothstep(rad - max(soft, 0.0005), rad + max(soft, 0.0005), r);
  return col + glowRGB * (glow * exp(-max(r - rad, 0.0) * 11.0) * outside);
}

fn mfRampPick(idx: f32,
              s0: vec3<f32>, s1: vec3<f32>, s2:  vec3<f32>, s3:  vec3<f32>,
              s4: vec3<f32>, s5: vec3<f32>, s6:  vec3<f32>, s7:  vec3<f32>,
              s8: vec3<f32>, s9: vec3<f32>, s10: vec3<f32>, s11: vec3<f32>) -> vec3<f32> {
  var r = s0;
  r = select(r, s1,  idx == 1.0);
  r = select(r, s2,  idx == 2.0);
  r = select(r, s3,  idx == 3.0);
  r = select(r, s4,  idx == 4.0);
  r = select(r, s5,  idx == 5.0);
  r = select(r, s6,  idx == 6.0);
  r = select(r, s7,  idx == 7.0);
  r = select(r, s8,  idx == 8.0);
  r = select(r, s9,  idx == 9.0);
  r = select(r, s10, idx == 10.0);
  r = select(r, s11, idx == 11.0);
  return r;
}

fn mfRampCyc(tIn: f32, n: f32,
             s0: vec3<f32>, s1: vec3<f32>, s2:  vec3<f32>, s3:  vec3<f32>,
             s4: vec3<f32>, s5: vec3<f32>, s6:  vec3<f32>, s7:  vec3<f32>,
             s8: vec3<f32>, s9: vec3<f32>, s10: vec3<f32>, s11: vec3<f32>) -> vec3<f32> {
  let k  = clamp(floor(n + 0.5), 1.0, 12.0);
  let x  = fract(tIn) * k;
  let i0 = min(floor(x), k - 1.0);
  let i1 = select(i0 + 1.0, 0.0, i0 + 1.0 >= k);
  return mix(mfRampPick(i0, s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11),
             mfRampPick(i1, s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11),
             x - i0);
}

fn mfRampLin(tIn: f32, n: f32,
             s0: vec3<f32>, s1: vec3<f32>, s2:  vec3<f32>, s3:  vec3<f32>,
             s4: vec3<f32>, s5: vec3<f32>, s6:  vec3<f32>, s7:  vec3<f32>,
             s8: vec3<f32>, s9: vec3<f32>, s10: vec3<f32>, s11: vec3<f32>) -> vec3<f32> {
  let k  = clamp(floor(n + 0.5), 1.0, 12.0);
  let x  = clamp(tIn, 0.0, 1.0) * (k - 1.0);
  let i0 = clamp(floor(x), 0.0, max(k - 2.0, 0.0));
  return mix(mfRampPick(i0,     s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11),
             mfRampPick(i0 + 1.0, s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11),
             x - i0);
}

const GL_FU:   f32 = 0.88172043;
const GL_BSIG_CLEAR: f32 = 0.01800000;
const GL_BSIG_GLASS: f32 = 0.03990000;
const GL_KA:  f32 = 6.0;
const GL_KG:  f32 = 4.1209;
const GL_KWA: f32 = 0.5;
const GL_KR:  f32 = 0.32;
const GL_GH:  f32 = 1.73205081;
const GL_CLEAR_EA: f32 = 0.995;
const GL_CLEAR_EB: f32 = 1.04;

fn lqHash(pIn: vec2<f32>) -> f32 {
  var p = fract(pIn * vec2<f32>(123.34, 456.21));
  p = p + vec2<f32>(dot(p, p + vec2<f32>(45.32)));
  return fract(p.x * p.y);
}

fn lqNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lqHash(i), lqHash(i + vec2<f32>(1.0, 0.0)), f.x),
             mix(lqHash(i + vec2<f32>(0.0, 1.0)), lqHash(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}

fn lqFbm(pIn: vec2<f32>, bs: f32) -> vec2<f32> {
  var p = pIn;
  var s:  f32 = 0.0;
  var a:  f32 = 0.5;
  var m:  f32 = 0.0;
  var vr: f32 = 0.0;
  let e = -GL_KA * bs * bs;
  var g: f32 = 1.0;
  for (var i: i32 = 0; i < 5; i = i + 1) {
    let b = exp(e * g);
    s  = s  + a * (0.5 + b * (lqNoise(p) - 0.5));
    vr = vr + a * a * (1.0 - b * b);
    m  = m + a;
    a  = a * 0.5;
    g  = g * GL_KG;
    p = vec2<f32>(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.03;
  }
  return vec2<f32>(s / m, GL_KR * sqrt(vr) / m);
}

fn lqRidge(v: f32, k: f32) -> f32 {
  return pow(clamp(1.0 - abs(v * 2.0 - 1.0), 0.0, 1.0), k);
}

fn lqRamp(v: f32, cA: vec3<f32>, cB: vec3<f32>, cC: vec3<f32>, cD: vec3<f32>) -> vec3<f32> {
  var c = mix(cA, cB, smoothstep(0.0, 0.45, v));
  c = mix(c, cC, smoothstep(0.38, 0.72, v));
  c = mix(c, cD, smoothstep(0.68, 1.0, v));
  return select(c, mfRampLin(v, u.paletteCount,
                             u.paletteStop0.rgb, u.paletteStop1.rgb, u.paletteStop2.rgb,
                             u.paletteStop3.rgb, u.paletteStop4.rgb, u.paletteStop5.rgb,
                             u.paletteStop6.rgb, u.paletteStop7.rgb, u.paletteStop8.rgb,
                             u.paletteStop9.rgb, u.paletteStop10.rgb, u.paletteStop11.rgb), u.paletteCount > 0.5);
}

fn lqRidgeS(vs: vec2<f32>, k: f32) -> f32 {
  let d = GL_GH * vs.y;
  return (lqRidge(vs.x - d, k) + 4.0 * lqRidge(vs.x, k) + lqRidge(vs.x + d, k)) / 6.0;
}

fn lqStepS(vs: vec2<f32>, a: f32, b: f32) -> f32 {
  let d = GL_GH * vs.y;
  return (smoothstep(a, b, vs.x - d) + 4.0 * smoothstep(a, b, vs.x)
        + smoothstep(a, b, vs.x + d)) / 6.0;
}

fn lqPowS(vs: vec2<f32>, k: f32) -> f32 {
  let d = GL_GH * vs.y;
  return (pow(clamp(vs.x - d, 0.0, 1.0), k) + 4.0 * pow(clamp(vs.x, 0.0, 1.0), k)
        + pow(clamp(vs.x + d, 0.0, 1.0), k)) / 6.0;
}

fn glsFinishEmissionFluid(colorIn: vec3<f32>, p: vec2<f32>) -> vec3<f32> {
  var color = colorIn;
  if (u.glassEnabled > 0.5) {
    color = mix(color, u.highlightColor.rgb,
                u.shade * 0.22 * smoothstep(0.15, 1.15, dot(p, vec2<f32>(-0.32, 0.78))));
  }
  color = color * (1.0 - u.shade * 0.34
                  * smoothstep(-0.1, 1.2, dot(p, vec2<f32>(0.45, -0.62))));
  color = color * (1.0 - u.shade * 0.22 * smoothstep(0.72, 1.08, length(p)));
  return clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn glsSiriBand(q: vec2<f32>, drift: f32, phaseOffset: f32, amplitude: f32,
               mainY: f32, envelope: f32, softness: f32) -> vec2<f32> {
  let y = amplitude * envelope * sin(q.x * 1.0 + drift + phaseOffset);
  let distanceToLine = abs(q.y - y);
  let line = 0.018 / (sqrt(distanceToLine * distanceToLine + softness * softness) + 0.026);
  let bandDistance = max(0.0, max(q.y - max(mainY, y), min(mainY, y) - q.y));
  let band = 0.018 / (bandDistance + 0.075);
  return vec2<f32>(line, band);
}

fn glsSiriFluid(p: vec2<f32>, t: f32) -> vec3<f32> {
  let scale = 0.74 + u.zoom * 0.34;
  let q = p / scale;
  let xNorm = q.x;
  let envelopeBase = cos(1.57079633 * min(abs(0.9 * xNorm), 1.0));
  let envelope = envelopeBase * envelopeBase;
  let low = 0.5 + 0.5 * cos(t * 0.37);
  let mid = 0.5 + 0.5 * sin(t * 0.51 + 1.2);
  let high = 0.5 + 0.5 * cos(t * 0.73 + 2.1);
  let drift = t * 2.4;
  let mainAmplitude = 0.25 + u.ridgeAmt * 0.075 + low * 0.018;
  let bandAmplitude = mainAmplitude + mid * 0.025 + high * 0.018;
  let mainY = mainAmplitude * envelope * sin(q.x * 1.1 + drift);
  let separation = 1.85 + u.warp * 0.2 + mid * 0.28;
  let softness = 0.035 + (1.0 - u.ridgeAmt) * 0.018 + mid * 0.006;

  let band0 = glsSiriBand(q, drift, -separation, bandAmplitude, mainY, envelope, softness);
  let band1 = glsSiriBand(q, drift, -separation * 0.34, bandAmplitude, mainY, envelope, softness);
  let band2 = glsSiriBand(q, drift, separation * 0.34, bandAmplitude, mainY, envelope, softness);
  let band3 = glsSiriBand(q, drift, separation, bandAmplitude, mainY, envelope, softness);
  let w0 = band0.x + band0.y;
  let w1 = band1.x + band1.y;
  let w2 = band2.x + band2.y;
  let w3 = band3.x + band3.y;
  let dominant0 = w0 * w0;
  let dominant1 = w1 * w1;
  let dominant2 = w2 * w2;
  let dominant3 = w3 * w3;
  let dominantTotal = dominant0 + dominant1 + dominant2 + dominant3;
  let spectral = (u.colorA.rgb * dominant0 + u.colorC.rgb * dominant1
                + u.colorB.rgb * dominant2 + u.colorD.rgb * dominant3)
                / max(dominantTotal, 0.0001);
  let energy = (1.0 - exp(-(w0 + w1 + w2 + w3) * 0.58)) * envelope;
  let mainDistance = abs(q.y - mainY);
  let whiteCore = exp(-mainDistance * mainDistance / 0.0028) * envelope;
  let glassFill = select(0.0, 1.0, u.glassEnabled > 0.5);
  let atmosphere = mix(u.colorD.rgb, u.colorB.rgb,
                       smoothstep(-0.7, 0.7, q.y)) * 0.018 * glassFill;
  var color = atmosphere + spectral * energy * 1.14;
  color = color + u.highlightColor.rgb * whiteCore * (0.18 + 0.1 * low);
  let emissionMask = mix(smoothstep(0.08, 0.25, energy + whiteCore * 0.12),
                         1.0, glassFill);
  color = color * emissionMask;
  color = color / (vec3<f32>(1.0) + color * 0.18);
  return glsFinishEmissionFluid(color, p);
}

fn glsPresetFluid(p: vec2<f32>, style: i32, t: f32) -> vec3<f32> {
  return glsSiriFluid(p, t);
}

fn glsOver(dst: vec3<f32>, src: vec3<f32>, a: f32) -> vec3<f32> {
  let k = clamp(a, 0.0, 1.0);
  return src * k + dst * (1.0 - k);
}

fn glsRefractionProfile(t: f32) -> f32 {
  let depth = clamp(t, 0.0, 1.0);
  let circular = sqrt(max(1.0 - (1.0 - depth) * (1.0 - depth), 0.0));
  return 1.0 - circular;
}

fn glsHighlightLobe(normal: vec2<f32>, direction: vec2<f32>, cut: f32, power: f32) -> f32 {
  let angular = clamp((dot(normal, direction) - cut) / max(1.0 - cut, 0.001), 0.0, 1.0);
  return pow(angular, power);
}

fn orbGlassLiquidAnim(uv01: vec2<f32>) -> vec4<f32> {
  let fc = vec2<f32>(uv01.x, 1.0 - uv01.y) * u.size;
  let uv = (2.0 * fc - u.size) / max(min(u.size.x, u.size.y), 1.0);
  let rad = max(u.radius, 0.05);
  let t = u.time * u.speed;
  let s = 9;

  if (length(uv) > rad * (1.01 + mfEdgeD(u.edgeSoftness))) {
    let halo = clamp(mfEdgeGlow(vec3<f32>(0.0), uv, vec2<f32>(0.0), rad,
                                u.edgeSoftness, u.edgeGlow, u.glowColor.rgb),
                     vec3<f32>(0.0), vec3<f32>(1.0));
    let haloAlpha = max(halo.r, max(halo.g, halo.b));
    return vec4<f32>(halo, haloAlpha);
  }

  let p   = uv / rad;
  let pd  = length(p);
  let clearFa = 1.0 - smoothstep(GL_CLEAR_EA, GL_CLEAR_EB, pd);
  let normal = normalize(p);
  let edgeDepth = max(1.0 - pd, 0.0);
  let refractionWidth = 0.015 + 0.95 * clamp(u.shellMidAlpha, 0.0, 1.0);
  let refractionT = edgeDepth / max(refractionWidth, 0.001);
  let refractionProfile = pow(glsRefractionProfile(refractionT), 0.68);
  let refractionAmount = 1.6 * clamp(u.glassOpacity, 0.0, 1.0) * refractionProfile;
  let refractedP = p - normal * refractionAmount;

  var fcol = vec3<f32>(0.0);
  if (clearFa > 0.0) {
    if (u.glassEnabled > 0.5) {
      let channelSplit = 0.14 * clamp(u.gloss, 0.0, 2.0) * clamp(u.glassOpacity, 0.0, 1.0) * refractionProfile;
      let redSample = glsPresetFluid(refractedP - normal * channelSplit, s, t);
      let greenSample = glsPresetFluid(refractedP, s, t);
      let blueSample = glsPresetFluid(refractedP + normal * channelSplit, s, t);
      fcol = vec3<f32>(redSample.r, greenSample.g, blueSample.b);
    } else {
      fcol = glsPresetFluid(p, s, t);
    }
  }

  let lum = dot(fcol, vec3<f32>(0.213, 0.715, 0.072));
  let clearSat = clamp(vec3<f32>(lum) + (fcol - vec3<f32>(lum)) * 1.22, vec3<f32>(0.0), vec3<f32>(1.0));
  var col = glsOver(u.canvasColor.rgb, clearSat, 0.99 * clearFa);

  if (u.glassEnabled > 0.5) {
    let surfaceWidth = 0.026 + 0.055 * clamp(u.shellEdgeAlpha, 0.0, 1.0);
    let surfaceBand = (1.0 - smoothstep(0.0, surfaceWidth, edgeDepth)) * clearFa;
    let opticalRim = pow(surfaceBand, 1.8);
    let innerRimAlpha = opticalRim * u.glassOpacity * 0.45;
    col = glsOver(col, u.shellInner.rgb, innerRimAlpha);

    let coolDirection = normalize(vec2<f32>(0.84, 0.54));
    let warmDirection = normalize(vec2<f32>(-0.62, -0.78));
    let coolSplit = glsHighlightLobe(normal, coolDirection, -0.32, 1.8);
    let warmSplit = glsHighlightLobe(normal, warmDirection, -0.28, 2.0);
    let dispersion = opticalRim * clamp(u.gloss, 0.0, 2.0) * (0.8 + 0.8 * u.shellEdgeAlpha);
    col = glsOver(col, u.shellMid.rgb, dispersion * coolSplit);
    col = glsOver(col, u.shellEdge.rgb, dispersion * warmSplit);

    let edgeShadow = opticalRim * (0.015 + 0.15 * u.shellEdgeAlpha) * (0.15 + 0.85 * max(dot(normal, vec2<f32>(0.45, -0.89)), 0.0));
    col = col * (1.0 - edgeShadow);

    let keyDirection = normalize(vec2<f32>(-0.68, 0.73));
    let fillDirection = normalize(vec2<f32>(0.74, -0.67));
    let key = opticalRim * glsHighlightLobe(normal, keyDirection, 0.2, 2.8) * clamp(u.sheen, 0.0, 2.0) * 1.4;
    let fill = opticalRim * glsHighlightLobe(normal, fillDirection, 0.4, 3.6) * clamp(u.sheen, 0.0, 2.0) * 1.0;
    col = glsOver(col, u.sheenColor.rgb, key);
    col = glsOver(col, u.specColor.rgb, fill);
  }

  let ballA = 1.0 - smoothstep(0.99 - mfEdgeD(u.edgeSoftness), 1.01 + mfEdgeD(u.edgeSoftness), pd);
  col = clamp(col * max(u.exposure, 0.0), vec3<f32>(0.0), vec3<f32>(1.0)) * ballA;
  let edged = mfEdgeGlow(col, uv, vec2<f32>(0.0), rad, u.edgeSoftness, u.edgeGlow, u.glowColor.rgb);
  let finalColor = clamp(edged, vec3<f32>(0.0), vec3<f32>(1.0));
  let emissionAlpha = max(finalColor.r, max(finalColor.g, finalColor.b));
  let sphereAlpha = clamp(max(ballA, emissionAlpha), 0.0, 1.0);
  return vec4<f32>(finalColor, sphereAlpha);
}

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  var out: VOut;
  out.pos = vec4<f32>(p[i], 0.0, 1.0);
  let uv01 = (p[i] + vec2<f32>(1.0)) * 0.5;
  out.uv = vec2<f32>(uv01.x, 1.0 - uv01.y);
  return out;
}

@fragment
fn fs_main(in: VOut) -> @location(0) vec4<f32> {
  let c = orbGlassLiquidAnim(in.uv);
  let fc = vec2<f32>(in.uv.x, 1.0 - in.uv.y) * u.size;
  let rad = max(u.radius, 0.05);
  let q = (2.0 * fc - u.size) / u.size;
  let fitEnd = 1.0;
  let fitFeather = 2.0 / max(min(u.size.x, u.size.y), 1.0);
  let fitStart = min(mix(rad, fitEnd, 0.5), fitEnd - fitFeather);
  let fit = 1.0 - smoothstep(fitStart, fitEnd, max(abs(q.x), abs(q.y)));
  return vec4<f32>(c.rgb * fit, c.a * fit);
}
`;

// ── Universal WebGL GLSL Shader (Guaranteed cross-browser 60fps Liquid Glass Orb) ───
const vertexShaderGLSL = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShaderGLSL = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;
uniform float u_state;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;
uniform vec3 u_colorD;
uniform vec3 u_highlight;
uniform vec3 u_glow;

vec2 glsSiriBand(vec2 q, float drift, float phaseOffset, float amplitude, float mainY, float envelope, float softness) {
  float y = amplitude * envelope * sin(q.x * 1.0 + drift + phaseOffset);
  float distanceToLine = abs(q.y - y);
  float line = 0.018 / (sqrt(distanceToLine * distanceToLine + softness * softness) + 0.026);
  float bandDistance = max(0.0, max(q.y - max(mainY, y), min(mainY, y) - q.y));
  float band = 0.018 / (bandDistance + 0.075);
  return vec2(line, band);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (2.0 * fc - u_resolution) / max(min(u_resolution.x, u_resolution.y), 1.0);
  float rad = 0.72;
  float t = u_time * mix(0.246, 0.82, u_state);
  float d = length(uv);

  if (d > rad * 1.15) {
    float r = d;
    float outside = smoothstep(rad - 0.03, rad + 0.03, r);
    vec3 halo = u_glow * (0.35 * exp(-max(r - rad, 0.0) * 11.0) * outside);
    gl_FragColor = vec4(halo, max(halo.r, max(halo.g, halo.b)));
    return;
  }

  vec2 p = uv / rad;
  float pd = length(p);
  float scale = 0.74 + 0.34 * 0.34;
  vec2 q = p / scale;

  float xNorm = q.x;
  float envelopeBase = cos(1.57079633 * min(abs(0.9 * xNorm), 1.0));
  float envelope = envelopeBase * envelopeBase;
  float low = 0.5 + 0.5 * cos(t * 0.37);
  float mid = 0.5 + 0.5 * sin(t * 0.51 + 1.2);
  float high = 0.5 + 0.5 * cos(t * 0.73 + 2.1);
  float drift = t * 2.4;
  float ridgeAmt = mix(0.24, 0.5, u_state);
  float warp = mix(1.66, 3.2, u_state);
  float mainAmplitude = 0.25 + ridgeAmt * 0.075 + low * 0.018;
  float bandAmplitude = mainAmplitude + mid * 0.025 + high * 0.018;
  float mainY = mainAmplitude * envelope * sin(q.x * 1.1 + drift);
  float separation = 1.85 + warp * 0.2 + mid * 0.28;
  float softness = 0.035 + (1.0 - ridgeAmt) * 0.018 + mid * 0.006;

  vec2 b0 = glsSiriBand(q, drift, -separation, bandAmplitude, mainY, envelope, softness);
  vec2 b1 = glsSiriBand(q, drift, -separation * 0.34, bandAmplitude, mainY, envelope, softness);
  vec2 b2 = glsSiriBand(q, drift, separation * 0.34, bandAmplitude, mainY, envelope, softness);
  vec2 b3 = glsSiriBand(q, drift, separation, bandAmplitude, mainY, envelope, softness);

  float w0 = b0.x + b0.y;
  float w1 = b1.x + b1.y;
  float w2 = b2.x + b2.y;
  float w3 = b3.x + b3.y;
  float dominant0 = w0 * w0;
  float dominant1 = w1 * w1;
  float dominant2 = w2 * w2;
  float dominant3 = w3 * w3;
  float dominantTotal = dominant0 + dominant1 + dominant2 + dominant3;
  vec3 spectral = (u_colorA * dominant0 + u_colorC * dominant1 + u_colorB * dominant2 + u_colorD * dominant3) / max(dominantTotal, 0.0001);

  float total = w0 + w1 + w2 + w3;
  float energy = (1.0 - exp(-total * 0.58)) * envelope;
  float mainDistance = abs(q.y - mainY);
  float whiteCore = exp(-mainDistance * mainDistance / 0.0028) * envelope;
  vec3 atmosphere = mix(u_colorD, u_colorB, smoothstep(-0.7, 0.7, q.y)) * 0.025;
  vec3 col = atmosphere + spectral * energy * 1.25;
  col += u_highlight * whiteCore * (0.22 + 0.12 * low);
  col = col / (vec3(1.0) + col * 0.18);

  // Glass Refraction & Rim Light
  float edgeDepth = max(1.0 - pd, 0.0);
  float surfaceBand = (1.0 - smoothstep(0.0, 0.08, edgeDepth));
  float opticalRim = pow(surfaceBand, 1.8);
  vec2 normal = normalize(p);
  vec2 coolDir = normalize(vec2(0.84, 0.54));
  vec2 warmDir = normalize(vec2(-0.62, -0.78));
  float coolSplit = pow(clamp((dot(normal, coolDir) + 0.32) / 1.32, 0.0, 1.0), 1.8);
  float warmSplit = pow(clamp((dot(normal, warmDir) + 0.28) / 1.28, 0.0, 1.0), 2.0);
  col = mix(col, u_colorB, opticalRim * 0.45 * coolSplit);
  col = mix(col, u_colorC, opticalRim * 0.45 * warmSplit);

  vec2 keyDir = normalize(vec2(-0.68, 0.73));
  float key = opticalRim * pow(clamp((dot(normal, keyDir) - 0.2) / 0.8, 0.0, 1.0), 2.8) * 1.4;
  col = mix(col, u_highlight, key);

  float ballA = 1.0 - smoothstep(0.98, 1.02, pd);
  float exposure = mix(1.36, 2.0, u_state);
  col = clamp(col * exposure, 0.0, 1.0) * ballA;
  float alpha = clamp(max(ballA * 0.98, max(col.r, max(col.g, col.b))), 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
}
`;

const stateSeeds: Record<'idle' | 'thinking', number[]> = {
  idle: [
    1, 1, 0, 0.2460000067949295, 0.7200000286102295, 0.3384000062942505, 1.6640000343322754,
    0.23999999463558197, 1.9800000190734863, 0.11999999731779099, 0.2800000011920929,
    0.23999999463558197, 0.18000000715255737, 0.18000000715255737, 1.3600000143051147, 9,
    0.029999999329447746, 0, 0, 1, 0.4399999976158142, 0, 2, 0.41999998688697815,
    0.7699999809265137, 0.23000000417232513, 65, 0, 0, 1, 0.2199999988079071, 0.25,
    0.7200000286102295, 5, 0.41999998688697815, 1.25, 0.550000011920929, 0.30000001192092896,
    1.2000000476837158, 0.699999988079071, 0.7098039388656616, 0.6509804129600525,
    0.45490196347236633, 1, 0.3686274588108063, 0.529411792755127, 0.5803921818733215, 1,
    0.6039215922355652, 0.3921568691730499, 0.5411764979362488, 1, 0.38823530077934265,
    0.35686275362968445, 0.5411764979362488, 1, 0.7137255072593689, 0.7686274647712708,
    0.8235294222831726, 1, 1, 1, 1, 1, 0.6078431606292725, 0.95686274766922, 1, 1,
    0.772549033164978, 0.6627451181411743, 1, 1, 0.9176470637321472, 0.95686274766922, 1, 1,
    0.8627451062202454, 0.9176470637321472, 1, 1, 0.0117647061124444, 0.01568627543747425,
    0.03529411926865578, 1, 0.42352941632270813, 0.40784314274787903, 0.5607843399047852, 1,
    0.9686274528503418, 0.9843137264251709, 1, 1, 0.9372549057006836, 0.9647058844566345,
    0.9921568632125854, 1, 0.8784313797950745, 0.9333333373069763, 0.9764705896377563, 1,
    0.8313725590705872, 0.9019607901573181, 0.9686274528503418, 1, 0.7333333492279053,
    0.8352941274642944, 0.9529411792755127, 1, 0.6509804129600525, 0.7803921699523926,
    0.9411764740943909, 1, 0.529411792755127, 0.6901960968971252, 0.9215686321258545, 1,
    0.43529412150382996, 0.6196078658103943, 0.9098039269447327, 1, 0.43529412150382996,
    0.6196078658103943, 0.9098039269447327, 1, 0.43529412150382996, 0.6196078658103943,
    0.9098039269447327, 1, 0.43529412150382996, 0.6196078658103943, 0.9098039269447327, 1,
    0.43529412150382996, 0.6196078658103943, 0.9098039269447327, 1,
  ],
  thinking: [
    1, 1, 0, 0.8199999928474426, 0.7200000286102295, 0.36000001430511475, 3.200000047683716,
    0.5, 2.200000047683716, 0.11999999731779099, 0.2800000011920929, 0.23999999463558197,
    0.18000000715255737, 0.18000000715255737, 2, 9, 0.029999999329447746, 0.17000000178813934,
    0, 1, 0.4399999976158142, 0, 2, 0.41999998688697815, 0.7699999809265137, 0.23000000417232513,
    65, 0, 0, 1, 0.2199999988079071, 0.25, 0.7200000286102295, 5, 0.41999998688697815, 1.25,
    0.550000011920929, 0.30000001192092896, 1.2000000476837158, 0.699999988079071, 1,
    0.8470588326454163, 0.41960784792900085, 1, 0.5098039507865906, 0.95686274766922, 1, 1, 1,
    0.48235294222831726, 0.8352941274642944, 1, 0.5568627715110779, 0.42352941632270813, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 0.6078431606292725, 0.95686274766922, 1, 1, 0.772549033164978,
    0.6627451181411743, 1, 1, 0.9176470637321472, 0.95686274766922, 1, 1, 0.8627451062202454,
    0.9176470637321472, 1, 1, 0.0117647061124444, 0.01568627543747425, 0.03529411926865578, 1,
    0.5843137502670288, 0.42352941632270813, 1, 1, 0.9686274528503418, 0.9843137264251709, 1, 1,
    0.9372549057006836, 0.9647058844566345, 0.9921568632125854, 1, 0.8784313797950745,
    0.9333333373069763, 0.9764705896377563, 1, 0.8313725590705872, 0.9019607901573181,
    0.9686274528503418, 1, 0.7333333492279053, 0.8352941274642944, 0.9529411792755127, 1,
    0.6509804129600525, 0.7803921699523926, 0.9411764740943909, 1, 0.529411792755127,
    0.6901960968971252, 0.9215686321258545, 1, 0.43529412150382996, 0.6196078658103943,
    0.9098039269447327, 1, 0.43529412150382996, 0.6196078658103943, 0.9098039269447327, 1,
    0.43529412150382996, 0.6196078658103943, 0.9098039269447327, 1, 0.43529412150382996,
    0.6196078658103943, 0.9098039269447327, 1, 0.43529412150382996, 0.6196078658103943,
    0.9098039269447327, 1,
  ],
};

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

function mixSrgb(from: number, to: number, progress: number): number {
  return linearToSrgb(srgbToLinear(from) + (srgbToLinear(to) - srgbToLinear(from)) * progress);
}

export const LiquidOrb = forwardRef<LiquidOrbHandle, LiquidOrbProps>(function LiquidOrb(
  {
    state: controlledState,
    isListening = false,
    size = 'hero',
    className = '',
    audioBands: incomingAudioBands,
    ...props
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const effectiveState = controlledState || (isListening ? 'thinking' : 'idle');
  const stateRef = useRef<'idle' | 'thinking'>(effectiveState);
  const transitionTargetStateRef = useRef<'idle' | 'thinking'>(effectiveState);
  const fromUniformsRef = useRef(new Float32Array(stateSeeds[effectiveState]));
  const targetUniformsRef = useRef(new Float32Array(stateSeeds[effectiveState]));
  const displayedUniformsRef = useRef(new Float32Array(stateSeeds[effectiveState]));
  const transitionStartedAtRef = useRef(0);
  const activeTransitionDurationRef = useRef(0);
  const audioBandsRef = useRef({ low: 0, mid: 0, high: 0, all: 0 });

  const sizeClasses: Record<string, string> = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-40 h-40',
    hero: 'w-60 h-60 sm:w-72 sm:h-72',
  };

  const currentSizeClass = sizeClasses[size] || size;

  const transitionProgress = (now: number) => {
    if (activeTransitionDurationRef.current === 0) return 1;
    const raw = Math.min(
      1,
      Math.max(0, (now - transitionStartedAtRef.current) / activeTransitionDurationRef.current)
    );
    return transitionTargetStateRef.current === 'thinking'
      ? 1 - (1 - raw) ** 3
      : raw * raw * (3 - 2 * raw);
  };

  const sampleTransition = (now: number) => {
    const progress = transitionProgress(now);
    const displayed = displayedUniformsRef.current;
    const from = fromUniformsRef.current;
    const target = targetUniformsRef.current;
    for (let index = 3; index < displayed.length; index += 1) {
      const colorComponent = index >= 40 && (index - 40) % 4 < 3;
      displayed[index] = colorComponent
        ? mixSrgb(from[index], target[index], progress)
        : from[index] + (target[index] - from[index]) * progress;
    }
    return displayed;
  };

  const switchState = (nextState: 'idle' | 'thinking') => {
    if (nextState === stateRef.current) return;
    const now = performance.now();
    sampleTransition(now);
    fromUniformsRef.current = new Float32Array(displayedUniformsRef.current);
    targetUniformsRef.current = new Float32Array(stateSeeds[nextState]);
    transitionTargetStateRef.current = nextState;
    transitionStartedAtRef.current = now;
    activeTransitionDurationRef.current = nextState === 'thinking' ? 220 : 650;
    stateRef.current = nextState;
  };

  const setAudioBands = (bands: { low?: number; mid?: number; high?: number; all?: number } = {}) => {
    audioBandsRef.current = {
      low: Number.isFinite(bands.low) ? Math.max(0, Math.min(1, bands.low!)) : 0,
      mid: Number.isFinite(bands.mid) ? Math.max(0, Math.min(1, bands.mid!)) : 0,
      high: Number.isFinite(bands.high) ? Math.max(0, Math.min(1, bands.high!)) : 0,
      all: Number.isFinite(bands.all) ? Math.max(0, Math.min(1, bands.all!)) : 0,
    };
  };

  useImperativeHandle(ref, () => ({
    setState: switchState,
    setAudioBands,
    getState: () => stateRef.current,
  }));

  useEffect(() => {
    switchState(effectiveState);
  }, [effectiveState]);

  useEffect(() => {
    if (incomingAudioBands) {
      setAudioBands(incomingAudioBands);
    }
  }, [incomingAudioBands]);

  // Unified Renderer (WebGPU with instant automatic WebGL fallback)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId = 0;
    let stopped = false;
    let lastFrameAt: number | null = null;
    let motionPhase = 0;

    // Try WebGPU first
    const initWebGPU = async (): Promise<boolean> => {
      const navGpu = (navigator as any)?.gpu;
      if (!navGpu) return false;

      try {
        const adapter = await navGpu.requestAdapter();
        if (!adapter) return false;

        const device = await adapter.requestDevice();
        if (stopped) {
          device.destroy();
          return false;
        }

        const context = (canvas as any).getContext('webgpu');
        if (!context) return false;

        const format = navGpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: 'premultiplied' });

        const shader = device.createShaderModule({ code: shaderSource });
        const pipeline = device.createRenderPipeline({
          layout: 'auto',
          vertex: { module: shader, entryPoint: 'vs_main' },
          fragment: {
            module: shader,
            entryPoint: 'fs_main',
            targets: [
              {
                format,
                blend: {
                  color: {
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src-alpha',
                    operation: 'add',
                  },
                  alpha: {
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src-alpha',
                    operation: 'add',
                  },
                },
              },
            ],
          },
          primitive: { topology: 'triangle-list' },
        });

        const values = new Float32Array(displayedUniformsRef.current);
        const uniformBuffer = device.createBuffer({
          size: values.byteLength,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });

        const renderWebGPU = (now: number) => {
          if (stopped) return;
          try {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(1, Math.floor((canvas.clientWidth || 260) * dpr));
            const height = Math.max(1, Math.floor((canvas.clientHeight || 260) * dpr));

            if (canvas.width !== width || canvas.height !== height) {
              canvas.width = width;
              canvas.height = height;
            }

            values.set(sampleTransition(now));
            const frameDelta =
              lastFrameAt === null ? 0 : Math.min(0.1, Math.max(0, (now - lastFrameAt) / 1000));
            lastFrameAt = now;

            motionPhase += frameDelta * Math.max(values[3], 0);
            values[0] = width;
            values[1] = height;
            values[2] = motionPhase / Math.max(values[3], 0.001);

            device.queue.writeBuffer(uniformBuffer, 0, values);

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
              colorAttachments: [
                {
                  view: context.getCurrentTexture().createView(),
                  clearValue: { r: 0, g: 0, b: 0, a: 0 },
                  loadOp: 'clear',
                  storeOp: 'store',
                },
              ],
            });

            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();

            device.queue.submit([encoder.finish()]);
            animId = requestAnimationFrame(renderWebGPU);
          } catch (_) {
            startWebGL();
          }
        };

        animId = requestAnimationFrame(renderWebGPU);
        return true;
      } catch (_) {
        return false;
      }
    };

    // Robust WebGL Fallback (renders matching Liquid Glass Orb on all devices)
    const startWebGL = () => {
      if (stopped) return;
      const gl = (canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

      if (!gl) return;

      const compileShader = (src: string, type: number) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };

      const vs = compileShader(vertexShaderGLSL, gl.VERTEX_SHADER);
      const fs = compileShader(fragmentShaderGLSL, gl.FRAGMENT_SHADER);
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.useProgram(prog);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );

      const aPos = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const uRes = gl.getUniformLocation(prog, 'u_resolution');
      const uTime = gl.getUniformLocation(prog, 'u_time');
      const uState = gl.getUniformLocation(prog, 'u_state');
      const uColA = gl.getUniformLocation(prog, 'u_colorA');
      const uColB = gl.getUniformLocation(prog, 'u_colorB');
      const uColC = gl.getUniformLocation(prog, 'u_colorC');
      const uColD = gl.getUniformLocation(prog, 'u_colorD');
      const uHighlight = gl.getUniformLocation(prog, 'u_highlight');
      const uGlow = gl.getUniformLocation(prog, 'u_glow');

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      let startTime = performance.now();

      const renderWebGL = (now: number) => {
        if (stopped) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.floor((canvas.clientWidth || 260) * dpr));
        const height = Math.max(1, Math.floor((canvas.clientHeight || 260) * dpr));

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
        }

        const uniforms = sampleTransition(now);
        const elapsed = (now - startTime) / 1000;
        const isThinking = stateRef.current === 'thinking' ? 1.0 : 0.0;

        gl.uniform2f(uRes, width, height);
        gl.uniform1f(uTime, elapsed);
        gl.uniform1f(uState, isThinking);

        gl.uniform3f(uColA, uniforms[40], uniforms[41], uniforms[42]);
        gl.uniform3f(uColB, uniforms[44], uniforms[45], uniforms[46]);
        gl.uniform3f(uColC, uniforms[48], uniforms[49], uniforms[50]);
        gl.uniform3f(uColD, uniforms[52], uniforms[53], uniforms[54]);
        gl.uniform3f(uHighlight, uniforms[56], uniforms[57], uniforms[58]);
        gl.uniform3f(uGlow, uniforms[84], uniforms[85], uniforms[86]);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        animId = requestAnimationFrame(renderWebGL);
      };

      animId = requestAnimationFrame(renderWebGL);
    };

    initWebGPU().then((supported) => {
      if (!supported && !stopped) {
        startWebGL();
      }
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      className={cn(
        'relative flex items-center justify-center select-none overflow-visible',
        currentSizeClass,
        className
      )}
      {...props}
    >
      {/* Dynamic ambient backlight aura */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-fuchsia-600/35 via-purple-600/30 to-cyan-500/25 blur-3xl animate-pulse pointer-events-none" />

      {/* Liquid Glass Orb Canvas */}
      <canvas
        ref={canvasRef}
        className="relative z-10 w-full h-full object-contain pointer-events-none select-none drop-shadow-[0_0_50px_rgba(168,85,247,0.35)]"
        aria-label="Liquid glass orb"
      />
    </div>
  );
});
