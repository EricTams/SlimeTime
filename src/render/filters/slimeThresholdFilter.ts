import { Filter, GlProgram, UniformGroup } from 'pixi.js';

export interface SlimeShaderTuningOptions {
  sourceBlurStrength: number;
  edgeThreshold: number;
  edgeFadeWidth: number;
  bodyStart: number;
  bodyEnd: number;
  thicknessStart: number;
  thicknessEnd: number;
  darkBoundaryWidth: number;
  darkBoundaryStrength: number;
  skirtScale: number;
  featherAlpha: number;
}

export interface SlimeShaderDebugOptions extends SlimeShaderTuningOptions {
  invalidColorOverlay: boolean;
  sampledColor: boolean;
  lighting: boolean;
  specular: boolean;
  rim: boolean;
  skirt: boolean;
  previewMode: number;
}

export const DEFAULT_SLIME_SHADER_TUNING: SlimeShaderTuningOptions = {
  sourceBlurStrength: 3.75,
  edgeThreshold: 0.04,
  edgeFadeWidth: 0.018,
  bodyStart: 0.09,
  bodyEnd: 0.17,
  thicknessStart: 0.09,
  thicknessEnd: 0.455,
  darkBoundaryWidth: 0.14,
  darkBoundaryStrength: 0.77,
  skirtScale: 0.08,
  featherAlpha: 0.045,
};

const vertex = `
precision highp float;

in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vWorldCoord;

uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    vWorldCoord = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}`;

const fragment = `
precision highp float;

in vec2 vTextureCoord;
in vec2 vWorldCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uEdgeThreshold;
uniform float uEdgeFadeWidth;
uniform float uBodyStart;
uniform float uBodyEnd;
uniform float uThicknessStart;
uniform float uThicknessEnd;
uniform float uDarkBoundaryWidth;
uniform float uDarkBoundaryStrength;
uniform float uSkirtScale;
uniform float uFeatherAlpha;
uniform vec3 uLightDirection;
uniform float uUseSampledColor;
uniform float uUseLighting;
uniform float uUseSpecular;
uniform float uUseRim;
uniform float uUseSkirt;
uniform float uShowInvalidColor;
uniform int uPreviewMode;

bool badFloat(float value)
{
    return !(value >= -65504.0 && value <= 65504.0);
}

bool badVec3(vec3 value)
{
    return badFloat(value.r) || badFloat(value.g) || badFloat(value.b);
}

bool badVec4(vec4 value)
{
    return badVec3(value.rgb) || badFloat(value.a);
}

void showInvalid(vec3 color)
{
    finalColor = vec4(color, 1.0);
}

vec3 safeNormalize(vec3 value)
{
    float lenSq = dot(value, value);
    if (lenSq <= 0.000001 || badFloat(lenSq)) {
        return vec3(0.0, 0.0, 1.0);
    }
    return value * inversesqrt(lenSq);
}

vec3 boostSaturation(vec3 color, float amount)
{
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    return clamp(mix(vec3(luminance), color, amount), vec3(0.0), vec3(1.0));
}

float safeSmoothstep(float edge0, float edge1, float value)
{
    return smoothstep(edge0, max(edge1, edge0 + 0.0001), value);
}

vec3 fieldColor(vec4 value)
{
    if (value.a < 0.018) {
        return vec3(0.0);
    }
    return clamp(value.rgb / max(value.a, 0.001), vec3(0.0), vec3(1.0));
}

vec3 chromaDirection(vec3 color)
{
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 chroma = color - vec3(luminance);
    float chromaLength = length(chroma);
    if (chromaLength <= 0.0001) {
        return vec3(0.0);
    }
    return chroma / chromaLength;
}

vec3 closestBlobColor(vec3 color)
{
    vec3 green = vec3(0.48235294, 0.82745098, 0.30980392);
    vec3 blue = vec3(0.32941176, 0.78039216, 1.0);
    vec3 pink = vec3(0.95686275, 0.54509804, 0.79607843);
    vec3 yellow = vec3(1.0, 0.81960784, 0.4);
    vec3 closest = green;
    vec3 colorChroma = chromaDirection(color);
    float closestDistance = dot(colorChroma - chromaDirection(green), colorChroma - chromaDirection(green));
    float candidateDistance = dot(colorChroma - chromaDirection(blue), colorChroma - chromaDirection(blue));
    if (candidateDistance < closestDistance) {
        closest = blue;
        closestDistance = candidateDistance;
    }
    candidateDistance = dot(colorChroma - chromaDirection(pink), colorChroma - chromaDirection(pink));
    if (candidateDistance < closestDistance) {
        closest = pink;
        closestDistance = candidateDistance;
    }
    candidateDistance = dot(colorChroma - chromaDirection(yellow), colorChroma - chromaDirection(yellow));
    if (candidateDistance < closestDistance) {
        closest = yellow;
    }
    return closest;
}

vec3 classifiedFieldColor(vec4 value)
{
    return closestBlobColor(fieldColor(value));
}

float classifiedColorBoundary(vec4 a, vec4 b)
{
    float valid = step(uEdgeThreshold, min(a.a, b.a));
    return valid * step(0.08, distance(classifiedFieldColor(a), classifiedFieldColor(b)));
}

float classifiedBoundaryAtRadius(vec2 radius)
{
    vec4 centerField = texture(uTexture, vTextureCoord);
    vec4 leftField = texture(uTexture, vTextureCoord - vec2(radius.x, 0.0));
    vec4 rightField = texture(uTexture, vTextureCoord + vec2(radius.x, 0.0));
    vec4 upField = texture(uTexture, vTextureCoord - vec2(0.0, radius.y));
    vec4 downField = texture(uTexture, vTextureCoord + vec2(0.0, radius.y));
    vec4 upLeftField = texture(uTexture, vTextureCoord - radius);
    vec4 downRightField = texture(uTexture, vTextureCoord + radius);
    vec4 upRightField = texture(uTexture, vTextureCoord + vec2(radius.x, -radius.y));
    vec4 downLeftField = texture(uTexture, vTextureCoord + vec2(-radius.x, radius.y));

    float centerSignal = max(
        max(classifiedColorBoundary(centerField, leftField), classifiedColorBoundary(centerField, rightField)),
        max(classifiedColorBoundary(centerField, upField), classifiedColorBoundary(centerField, downField))
    );
    float crossSignal = max(classifiedColorBoundary(leftField, rightField), classifiedColorBoundary(upField, downField));
    float diagonalSignal = max(
        classifiedColorBoundary(upLeftField, downRightField),
        classifiedColorBoundary(upRightField, downLeftField)
    );
    return max(max(centerSignal, crossSignal), diagonalSignal);
}

void main(void)
{
    vec4 field = texture(uTexture, vTextureCoord);
    if (uShowInvalidColor > 0.5 && badVec4(field)) {
        showInvalid(vec3(1.0, 0.0, 1.0));
        return;
    }

    vec2 texel = uInputSize.zw;
    vec4 leftField = texture(uTexture, vTextureCoord - vec2(texel.x, 0.0));
    vec4 rightField = texture(uTexture, vTextureCoord + vec2(texel.x, 0.0));
    vec4 upField = texture(uTexture, vTextureCoord - vec2(0.0, texel.y));
    vec4 downField = texture(uTexture, vTextureCoord + vec2(0.0, texel.y));
    float left = leftField.a;
    float right = rightField.a;
    float up = upField.a;
    float down = downField.a;
    float maskAlpha = field.a;
    if (uShowInvalidColor > 0.5 && badFloat(maskAlpha)) {
        showInvalid(vec3(1.0, 0.0, 0.0));
        return;
    }

    vec3 sampledColor = fieldColor(field);
    vec3 classifiedColor = classifiedFieldColor(field);

    if (uPreviewMode == 1) {
        finalColor = vec4(sampledColor, 1.0);
        return;
    }

    if (uPreviewMode == 2) {
        finalColor = vec4(vec3(maskAlpha), 1.0);
        return;
    }

    if (uPreviewMode == 3) {
        finalColor = vec4(classifiedColor, 1.0);
        return;
    }

    if (maskAlpha <= 0.001) {
        finalColor = vec4(0.0);
        return;
    }

    float fieldPresence = safeSmoothstep(uEdgeThreshold, uEdgeThreshold + uEdgeFadeWidth, maskAlpha);
    float body = safeSmoothstep(uBodyStart, uBodyEnd, maskAlpha);
    float thickness = safeSmoothstep(uThicknessStart, uThicknessEnd, maskAlpha);
    float height = pow(thickness, 0.62);
    float edge = fieldPresence * (1.0 - body);
    float skirt = edge * (1.0 - thickness * 0.68) * uSkirtScale;
    float contact = smoothstep(0.28, 0.86, thickness);
    float boundaryRadius = clamp(uDarkBoundaryWidth, 0.0, 0.5) * 36.0;
    vec2 classifiedRadius = texel * boundaryRadius;
    float classifiedBoundary = max(
        max(
            classifiedBoundaryAtRadius(classifiedRadius * 0.18),
            classifiedBoundaryAtRadius(classifiedRadius * 0.36) * 0.82
        ),
        max(
            max(classifiedBoundaryAtRadius(classifiedRadius * 0.56) * 0.62, classifiedBoundaryAtRadius(classifiedRadius * 0.78) * 0.40),
            classifiedBoundaryAtRadius(classifiedRadius) * 0.22
        )
    );
    float darkSuppression = 1.0 - classifiedBoundary * uDarkBoundaryStrength;
    float darkGel = contact * darkSuppression;
    if (uPreviewMode == 4) {
        finalColor = vec4(vec3(darkGel), 1.0);
        return;
    }
    if (
        uShowInvalidColor > 0.5 &&
        (
            badFloat(body) ||
            badFloat(edge) ||
            badFloat(thickness) ||
            badFloat(height) ||
            badFloat(skirt) ||
            badFloat(contact) ||
            badFloat(classifiedBoundary) ||
            badFloat(darkSuppression) ||
            badFloat(darkGel)
        )
    ) {
        showInvalid(vec3(1.0, 0.5, 0.0));
        return;
    }

    float colorConfidence = smoothstep(0.018, 0.12, field.a);
    float sampledLuminance = dot(sampledColor, vec3(0.299, 0.587, 0.114));
    vec3 slimeColor = mix(vec3(sampledLuminance), sampledColor, uUseSampledColor);
    slimeColor = boostSaturation(slimeColor, 1.38);
    vec3 deepGelColor = boostSaturation(slimeColor * vec3(0.38, 0.42, 0.34), 1.18);
    vec3 contactColor = boostSaturation(slimeColor * vec3(0.24, 0.27, 0.22), 1.10);
    vec3 skirtColorBase = mix(deepGelColor, slimeColor, 0.58);
    vec3 outlineColor = boostSaturation(slimeColor * vec3(0.26, 0.30, 0.24), 1.05);
    vec3 normal = safeNormalize(vec3((left - right) * 3.2, (up - down) * 3.2, mix(0.30, 1.32, height)));
    vec3 lightDirection = safeNormalize(uLightDirection);
    vec3 viewDirection = vec3(0.0, 0.0, 1.0);
    float normalViewDot = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float diffuseDot = clamp(dot(normal, lightDirection), 0.0, 1.0);
    float specularDot = clamp(dot(reflect(-lightDirection, normal), viewDirection), 0.0, 1.0);
    float diffuse = mix(0.82, 0.58 + diffuseDot * 0.42, uUseLighting);
    float rim = pow(1.0 - normalViewDot, 2.35) * body * uUseRim;
    float specular = pow(specularDot, 34.0) * body * (0.55 + height * 0.45) * uUseSpecular;
    if (
        uShowInvalidColor > 0.5 &&
        (
            badVec3(sampledColor) ||
            badFloat(colorConfidence) ||
            badFloat(sampledLuminance) ||
            badVec3(slimeColor) ||
            badVec3(deepGelColor) ||
            badVec3(contactColor) ||
            badVec3(normal) ||
            badFloat(diffuse) ||
            badFloat(rim) ||
            badFloat(specular)
        )
    ) {
        showInvalid(vec3(0.0, 1.0, 1.0));
        return;
    }

    vec3 gelBody = mix(slimeColor, deepGelColor, darkGel * 0.58);
    gelBody = mix(gelBody, contactColor, darkGel * 0.24);
    vec3 roundedBody = gelBody * (0.68 + diffuse * 0.36);
    roundedBody += mix(vec3(1.0), slimeColor, 0.18) * specular * 0.62;
    roundedBody += boostSaturation(slimeColor + vec3(0.20), 1.18) * rim * 0.16;

    vec3 skirtColor = skirtColorBase * (0.82 + diffuse * 0.10);
    vec3 skirtShadedColor = mix(skirtColor, roundedBody, body);
    vec3 color = mix(roundedBody, skirtShadedColor, uUseSkirt);
    color = mix(color, outlineColor, edge * 0.025 * uUseSkirt);
    color = mix(color, contactColor, darkGel * 0.18);
    float edgeAlpha = fieldPresence * uFeatherAlpha;
    float bodyAlpha = body * 0.94;
    float alpha = max(edgeAlpha, bodyAlpha);
    alpha = mix(alpha, alpha + skirt * 0.18 * uFeatherAlpha, uUseSkirt);
    alpha *= colorConfidence;
    if (
        uShowInvalidColor > 0.5 &&
        (badVec3(roundedBody) || badVec3(skirtColor) || badVec3(color) || badFloat(alpha) || alpha < -0.001 || alpha > 1.001)
    ) {
        showInvalid(vec3(1.0, 1.0, 0.0));
        return;
    }

    alpha = clamp(alpha, 0.0, 1.0);
    finalColor = vec4(clamp(color, vec3(0.0), vec3(1.0)) * alpha, alpha);
}`;

export class SlimeThresholdFilter extends Filter {
  private readonly thresholdUniforms: UniformGroup;

  constructor() {
    const thresholdUniforms = new UniformGroup({
      uEdgeThreshold: { value: DEFAULT_SLIME_SHADER_TUNING.edgeThreshold, type: 'f32' },
      uEdgeFadeWidth: { value: DEFAULT_SLIME_SHADER_TUNING.edgeFadeWidth, type: 'f32' },
      uBodyStart: { value: DEFAULT_SLIME_SHADER_TUNING.bodyStart, type: 'f32' },
      uBodyEnd: { value: DEFAULT_SLIME_SHADER_TUNING.bodyEnd, type: 'f32' },
      uThicknessStart: { value: DEFAULT_SLIME_SHADER_TUNING.thicknessStart, type: 'f32' },
      uThicknessEnd: { value: DEFAULT_SLIME_SHADER_TUNING.thicknessEnd, type: 'f32' },
      uDarkBoundaryWidth: { value: DEFAULT_SLIME_SHADER_TUNING.darkBoundaryWidth, type: 'f32' },
      uDarkBoundaryStrength: { value: DEFAULT_SLIME_SHADER_TUNING.darkBoundaryStrength, type: 'f32' },
      uSkirtScale: { value: DEFAULT_SLIME_SHADER_TUNING.skirtScale, type: 'f32' },
      uFeatherAlpha: { value: DEFAULT_SLIME_SHADER_TUNING.featherAlpha, type: 'f32' },
      uLightDirection: { value: new Float32Array([-0.45, -0.6, 0.82]), type: 'vec3<f32>' },
      uShowInvalidColor: { value: 1, type: 'f32' },
      uUseSampledColor: { value: 1, type: 'f32' },
      uUseLighting: { value: 1, type: 'f32' },
      uUseSpecular: { value: 1, type: 'f32' },
      uUseRim: { value: 1, type: 'f32' },
      uUseSkirt: { value: 1, type: 'f32' },
      uPreviewMode: { value: 0, type: 'i32' },
    });

    super({
      glProgram: GlProgram.from({
        vertex,
        fragment,
        name: 'slime-threshold-filter',
      }),
      resources: {
        thresholdUniforms,
      },
      padding: 24,
      antialias: 'on',
    });
    this.thresholdUniforms = thresholdUniforms;
  }

  setDebugOptions(options: SlimeShaderDebugOptions): void {
    this.thresholdUniforms.uniforms.uShowInvalidColor = Number(options.invalidColorOverlay);
    this.thresholdUniforms.uniforms.uUseSampledColor = Number(options.sampledColor);
    this.thresholdUniforms.uniforms.uUseLighting = Number(options.lighting);
    this.thresholdUniforms.uniforms.uUseSpecular = Number(options.specular);
    this.thresholdUniforms.uniforms.uUseRim = Number(options.rim);
    this.thresholdUniforms.uniforms.uUseSkirt = Number(options.skirt);
    this.thresholdUniforms.uniforms.uPreviewMode = options.previewMode;
    this.thresholdUniforms.uniforms.uEdgeThreshold = options.edgeThreshold;
    this.thresholdUniforms.uniforms.uEdgeFadeWidth = options.edgeFadeWidth;
    this.thresholdUniforms.uniforms.uBodyStart = options.bodyStart;
    this.thresholdUniforms.uniforms.uBodyEnd = options.bodyEnd;
    this.thresholdUniforms.uniforms.uThicknessStart = options.thicknessStart;
    this.thresholdUniforms.uniforms.uThicknessEnd = options.thicknessEnd;
    this.thresholdUniforms.uniforms.uDarkBoundaryWidth = options.darkBoundaryWidth;
    this.thresholdUniforms.uniforms.uDarkBoundaryStrength = options.darkBoundaryStrength;
    this.thresholdUniforms.uniforms.uSkirtScale = options.skirtScale;
    this.thresholdUniforms.uniforms.uFeatherAlpha = options.featherAlpha;
  }
}
