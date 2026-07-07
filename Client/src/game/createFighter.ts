import {
  AnimationGroup,
  Color3,
  PBRMaterial,
  Scene,
  SceneLoader,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

const MODEL_PATH = "/models/";
const MODEL_FILE = "fighter_combined.glb";

// fighter_combined.glb (base mesh + 36 Mixamo animation clips, merged via a
// headless Blender script - see PROGRESS.md) comes out at ~1/11th of our
// game's real-world scale. That's a consistent unit mismatch across the
// base model AND every merged animation clip (not something specific to one
// file - every source FBX measured the same ~0.01 scale after Blender's FBX
// import), so a single corrective scale here is the right fix rather than
// something to chase back into the asset pipeline.
const MODEL_SCALE = 11;

export interface Fighter {
  root: TransformNode;
  animationGroups: Map<string, AnimationGroup>;
  /** Brief white emissive flash - cheap, real-material-safe hit feedback (see FighterView's detectImpactEdge). */
  flashHit: () => void;
}

export async function createFighter(scene: Scene, name: string, position: Vector3): Promise<Fighter> {
  const result = await SceneLoader.ImportMeshAsync("", MODEL_PATH, MODEL_FILE, scene);

  const root = new TransformNode(name, scene);
  root.position = position;

  const modelRoot = result.meshes[0];
  modelRoot.parent = root;
  modelRoot.scaling.setAll(MODEL_SCALE);

  // glTF import auto-plays/targets the first animation group by default in
  // some Babylon versions - stop everything so FighterView starts from a
  // known (not-playing) state and decides what plays.
  const animationGroups = new Map<string, AnimationGroup>();
  for (const group of result.animationGroups) {
    group.stop();
    animationGroups.set(group.name, group);
  }

  // Each ImportMeshAsync call produces its own independent meshes/materials/
  // animation groups, so loading this twice (once per fighter) is safe - no
  // shared state between the two fighters.
  const materials = result.meshes
    .map((m) => m.material)
    .filter((m): m is PBRMaterial => m instanceof PBRMaterial);
  const baseEmissive = materials.map((m) => m.emissiveColor.clone());

  let flashUntilMs = 0;
  scene.onBeforeRenderObservable.add(() => {
    const flashing = performance.now() < flashUntilMs;
    materials.forEach((material, i) => {
      material.emissiveColor = flashing ? Color3.White() : baseEmissive[i];
    });
  });

  return {
    root,
    animationGroups,
    flashHit: () => {
      flashUntilMs = performance.now() + 60;
    },
  };
}
