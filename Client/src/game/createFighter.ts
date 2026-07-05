import {
  Animation,
  Color3,
  EasingFunction,
  MeshBuilder,
  Scene,
  SineEase,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

/**
 * A placeholder "stick figure" fighter rig: jointed boxes standing in for a
 * real skinned/animated character model. Good enough to validate movement,
 * facing, hitboxes, and combat feel over a real network connection before
 * investing in real art and skeletal animation retargeting (see
 * ARCHITECTURE.md's note on human/beast rig retargeting being a separate,
 * harder problem from this).
 */
export interface Fighter {
  root: TransformNode;
  rightShoulder: TransformNode;
  rightElbow: TransformNode;
  leftShoulder: TransformNode;
  leftElbow: TransformNode;
  rightHip: TransformNode;
  rightKnee: TransformNode;
  leftHip: TransformNode;
  leftKnee: TransformNode;
  /** Recolors the whole rig at once (shared material) - used for hitstun/blockstun/beast-form feedback. */
  setTint: (color: Color3) => void;
}

export function createFighter(scene: Scene, name: string, position: Vector3, color: Color3): Fighter {
  const material = new StandardMaterial(name + "Mat", scene);
  material.diffuseColor = color;

  const hingeMaterial = new StandardMaterial("hingeMat", scene);
  hingeMaterial.diffuseColor = new Color3(0.3, 0.3, 0.3);

  const root = new TransformNode(name, scene);
  root.position = position;

  const torso = MeshBuilder.CreateBox("torso", { width: 0.8, height: 1.2, depth: 0.4 }, scene);
  torso.parent = root;
  torso.position.y = 1.6;
  torso.material = material;

  const head = MeshBuilder.CreateBox("head", { size: 0.5 }, scene);
  head.parent = torso;
  head.position.y = 0.85;
  head.material = material;

  const createLimb = (namePrefix: string, isLeft: boolean, isArm: boolean) => {
    const sign = isLeft ? -1 : 1;

    const joint1 = new TransformNode(namePrefix + "Joint1", scene);
    joint1.parent = torso;

    if (isArm) {
      joint1.position = new Vector3(sign * 0.5, 0.5, 0);
    } else {
      joint1.position = new Vector3(sign * 0.25, -0.6, 0);
    }

    const hinge1Visual = MeshBuilder.CreateSphere(namePrefix + "Hinge1", { diameter: 0.25 }, scene);
    hinge1Visual.parent = joint1;
    hinge1Visual.material = hingeMaterial;

    const upperLimb = MeshBuilder.CreateBox(namePrefix + "Upper", { width: 0.18, height: 0.6, depth: 0.18 }, scene);
    upperLimb.parent = joint1;
    upperLimb.position.y = -0.3;
    upperLimb.material = material;

    const joint2 = new TransformNode(namePrefix + "Joint2", scene);
    joint2.parent = joint1;
    joint2.position.y = -0.6;

    const hinge2Visual = MeshBuilder.CreateSphere(namePrefix + "Hinge2", { diameter: 0.25 }, scene);
    hinge2Visual.parent = joint2;
    hinge2Visual.material = hingeMaterial;

    const lowerLimb = MeshBuilder.CreateBox(namePrefix + "Lower", { width: 0.18, height: 0.6, depth: 0.18 }, scene);
    lowerLimb.parent = joint2;
    lowerLimb.position.y = -0.3;
    lowerLimb.material = material;

    return { joint1, joint2 };
  };

  const rightArm = createLimb("rightArm", false, true);
  const leftArm = createLimb("leftArm", true, true);
  const rightLeg = createLimb("rightLeg", false, false);
  const leftLeg = createLimb("leftLeg", true, false);

  return {
    root,
    rightShoulder: rightArm.joint1,
    rightElbow: rightArm.joint2,
    leftShoulder: leftArm.joint1,
    leftElbow: leftArm.joint2,
    rightHip: rightLeg.joint1,
    rightKnee: rightLeg.joint2,
    leftHip: leftLeg.joint1,
    leftKnee: leftLeg.joint2,
    setTint: (tint: Color3) => {
      material.diffuseColor = tint;
    },
  };
}

export function playPunch(scene: Scene, fighter: Fighter): void {
  const frameRate = 30;
  const punchAnim = new Animation("punch", "rotation.x", frameRate, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);

  punchAnim.setKeys([
    { frame: 0, value: 0 },
    { frame: 10, value: -Math.PI / 2 },
    { frame: 20, value: 0 },
    { frame: 45, value: 0 },
  ]);

  const easingFunction = new SineEase();
  easingFunction.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
  punchAnim.setEasingFunction(easingFunction);

  fighter.rightShoulder.animations = [punchAnim];
  scene.beginAnimation(fighter.rightShoulder, 0, 45, false);
}

export function playKick(scene: Scene, fighter: Fighter): void {
  const frameRate = 30;
  const kickHipAnim = new Animation("kickHip", "rotation.x", frameRate, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
  const kickKneeAnim = new Animation("kickKnee", "rotation.x", frameRate, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);

  kickHipAnim.setKeys([
    { frame: 0, value: 0 },
    { frame: 10, value: -Math.PI / 2.5 },
    { frame: 20, value: 0 },
    { frame: 45, value: 0 },
  ]);

  kickKneeAnim.setKeys([
    { frame: 0, value: 0 },
    { frame: 5, value: Math.PI / 4 },
    { frame: 10, value: 0 },
    { frame: 20, value: 0 },
    { frame: 45, value: 0 },
  ]);

  fighter.rightHip.animations = [kickHipAnim];
  fighter.rightKnee.animations = [kickKneeAnim];

  scene.beginAnimation(fighter.rightHip, 0, 45, false);
  scene.beginAnimation(fighter.rightKnee, 0, 45, false);
}
