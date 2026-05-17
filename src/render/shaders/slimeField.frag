precision mediump float;

varying vec2 vTextureCoord;

void main() {
  float field = smoothstep(0.35, 0.5, 1.0 - length(vTextureCoord - vec2(0.5)) * 2.0);
  gl_FragColor = vec4(0.35, 0.9, 0.28, field);
}
