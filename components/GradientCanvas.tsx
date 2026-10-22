"use client";

import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

const LIGHT = { color1: "#ffcfb3", color2: "#f2dcc0", color3: "#dccbec" };
const DARK = { color1: "#8a5a4f", color2: "#6e5c48", color3: "#5e4f7a" };

export default function GradientCanvas({ dark, animate }: { dark: boolean; animate: boolean }) {
  const colors = dark ? DARK : LIGHT;
  return (
    <ShaderGradientCanvas
      style={{ position: "absolute", inset: 0 }}
      pixelDensity={1}
      fov={45}
      pointerEvents="none"
      lazyLoad={false}
      powerPreference="low-power"
    >
      <ShaderGradient
        control="props"
        type="plane"
        animate={animate ? "on" : "off"}
        uSpeed={0.12}
        uStrength={2.2}
        uDensity={1.3}
        uFrequency={5}
        uAmplitude={1}
        cDistance={3.6}
        cPolarAngle={90}
        cAzimuthAngle={180}
        positionX={-1.4}
        positionY={0}
        positionZ={0}
        rotationX={0}
        rotationY={10}
        rotationZ={50}
        lightType="3d"
        brightness={dark ? 0.9 : 1.2}
        grain="off"
        {...colors}
      />
    </ShaderGradientCanvas>
  );
}
