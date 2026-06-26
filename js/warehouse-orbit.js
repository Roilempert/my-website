Object.assign(ActionWarehouse, {
    stabilizeOrbitTargets(bodiesData, prevTargets, blockCount) {
        if (!prevTargets || prevTargets.size === 0 || blockCount < 2) return;

        const heavyLerp = this.getHeavyTargetLerp(blockCount);
        const blend = heavyLerp != null
            ? heavyLerp
            : (CONFIG.physics.targetSmoothing.multiBlock ?? 0.1);
        const kinematic = this.isKinematicCaptureMode(blockCount);
        const kCfg = CONFIG.physics.crowdedBlock;

        let jumpCap = this.getOrbitJumpCap(blockCount);
        if (kinematic) {
            jumpCap = Math.min(jumpCap, scale(kCfg.kinematicJumpCap ?? 22));
        }
        if (blockCount >= 5 && this.stretchedNotes.size >= 7) {
            jumpCap = Math.min(jumpCap, scale(28));
        }
        if (this._orbitTransitionTicks > 0) {
            jumpCap = Math.min(jumpCap, blockCount >= 7 ? scale(10) : scale(14));
            this._orbitTransitionTicks--;
        }
        const moderateJump = scale(16);
        const fuseThreshold = Math.max(scale(150), jumpCap * 3);
        let maxOrbitJump = 0;
        let fuseHits = 0;
        let clippedJumpCount = 0;

        bodiesData.forEach(d => {
            if (!d.overrideTarget) return;

            const captureBlock = blockCount >= 5 && !this.stretchedNotes.has(d.noteIndex)
                ? this.getOrbitAnchorBlock(d) : null;
            const rawLayoutX = d.overrideTarget.x;
            const rawLayoutY = d.overrideTarget.y;
            let layoutX = rawLayoutX;
            let layoutY = rawLayoutY;

            if (captureBlock) {
                const clamped = this.clampTargetToBlockRing(layoutX, layoutY, captureBlock);
                layoutX = clamped.x;
                layoutY = clamped.y;
            }

            const prev = prevTargets.get(d);
            if (!prev) {
                d.overrideTarget.x = layoutX;
                d.overrideTarget.y = layoutY;
                if (d.smoothTarget) {
                    d.smoothTarget.x = layoutX;
                    d.smoothTarget.y = layoutY;
                }
                return;
            }

            const rawJump = Math.hypot(rawLayoutX - prev.x, rawLayoutY - prev.y);
            if (rawJump > maxOrbitJump) maxOrbitJump = rawJump;

            let fuseX = prev.x;
            let fuseY = prev.y;
            if (captureBlock) {
                const ringPrev = this.clampTargetToBlockRing(prev.x, prev.y, captureBlock);
                fuseX = ringPrev.x;
                fuseY = ringPrev.y;
            }

            if (!Number.isFinite(layoutX) || !Number.isFinite(layoutY)) {
                d.overrideTarget.x = fuseX;
                d.overrideTarget.y = fuseY;
            } else {
                let fuseStepped = false;
                const fuseJump = Math.hypot(layoutX - fuseX, layoutY - fuseY);

                if (fuseJump > fuseThreshold) {
                    const tdist = fuseJump || 1;
                    d.overrideTarget.x = fuseX + (layoutX - fuseX) / tdist * jumpCap;
                    d.overrideTarget.y = fuseY + (layoutY - fuseY) / tdist * jumpCap;
                    fuseStepped = true;
                    fuseHits++;
                    clippedJumpCount++;
                } else if (fuseJump > jumpCap) {
                    const tdist = fuseJump || 1;
                    d.overrideTarget.x = fuseX + (layoutX - fuseX) / tdist * jumpCap;
                    d.overrideTarget.y = fuseY + (layoutY - fuseY) / tdist * jumpCap;
                    clippedJumpCount++;
                } else {
                    d.overrideTarget.x = layoutX;
                    d.overrideTarget.y = layoutY;
                }

                if (!fuseStepped) {
                    const curX = d.overrideTarget.x;
                    const curY = d.overrideTarget.y;
                    const postJump = Math.hypot(curX - fuseX, curY - fuseY);
                    let stepBlend = blend;
                    if (rawJump > moderateJump) {
                        const stepCap = kinematic
                            ? (kCfg.kinematicStepCap ?? 0.12)
                            : (blockCount >= 7 ? 0.18 : (blockCount >= 6 ? 0.22 : 0.45));
                        stepBlend = Math.min(stepCap, 0.1 + postJump / scale(55));
                        if (rawJump > jumpCap * 0.85) {
                            const floorBlend = kinematic
                                ? (kCfg.kinematicStepFloor ?? 0.08)
                                : (blockCount >= 7 ? 0.15 : (blockCount >= 6 ? 0.18 : 0.3));
                            stepBlend = Math.max(stepBlend, floorBlend);
                        }
                    }

                    d.overrideTarget.x = fuseX + (curX - fuseX) * stepBlend;
                    d.overrideTarget.y = fuseY + (curY - fuseY) * stepBlend;
                }

                if (fuseStepped && d.smoothTarget) {
                    d.smoothTarget.x = d.overrideTarget.x;
                    d.smoothTarget.y = d.overrideTarget.y;
                } else if (rawJump > jumpCap && d.smoothTarget) {
                    d.smoothTarget.x = d.overrideTarget.x;
                    d.smoothTarget.y = d.overrideTarget.y;
                }
            }

            if (captureBlock) {
                const ringClamped = this.clampTargetToBlockRing(
                    d.overrideTarget.x, d.overrideTarget.y, captureBlock
                );
                d.overrideTarget.x = ringClamped.x;
                d.overrideTarget.y = ringClamped.y;
                if (d.smoothTarget) {
                    d.smoothTarget.x = ringClamped.x;
                    d.smoothTarget.y = ringClamped.y;
                }
            } else if (blockCount < 6 && d.body && !d.onBankGrid && !this.stretchedNotes.has(d.noteIndex)) {
                const bodyDx = d.overrideTarget.x - d.body.position.x;
                const bodyDy = d.overrideTarget.y - d.body.position.y;
                const bodyDist = Math.hypot(bodyDx, bodyDy);
                const maxBodyReach = scale(280);
                if (bodyDist > maxBodyReach) {
                    const scaleDown = maxBodyReach / bodyDist;
                    d.overrideTarget.x = d.body.position.x + bodyDx * scaleDown;
                    d.overrideTarget.y = d.body.position.y + bodyDy * scaleDown;
                    if (d.smoothTarget) {
                        d.smoothTarget.x = d.overrideTarget.x;
                        d.smoothTarget.y = d.overrideTarget.y;
                    }
                }
            }
        });

        window.__physDbgOrbit = {
            maxOrbitJump, fuseHits, clippedJumpCount, jumpCap, fuseThreshold,
            blockCount, ts: performance.now()
        };
    },

    smoothOrbitTargets(bodiesData, activeBlockCount) {
        if (activeBlockCount === 0) {
            bodiesData.forEach(d => { d.smoothTarget = null; });
            return;
        }

        const smoothCfg = CONFIG.physics.targetSmoothing;
        const blocksDragging = this.isAnyCaptureBlockDragging();
        const kinematic = this.isKinematicCaptureMode(activeBlockCount);
        const kCfg = CONFIG.physics.crowdedBlock;

        bodiesData.forEach(d => {
            if (!d.overrideTarget) {
                d.smoothTarget = null;
                return;
            }

            if (!d.smoothTarget) {
                d.smoothTarget = { x: d.overrideTarget.x, y: d.overrideTarget.y };
                return;
            }

            if (kinematic) {
                const isStretched = this.stretchedNotes.has(d.noteIndex);
                let sLerp;
                let maxStep;
                if (blocksDragging) {
                    sLerp = kCfg.kinematicSmoothLerpDrag ?? 0.22;
                    maxStep = scale(kCfg.kinematicSmoothMaxStepDrag ?? 3.2);
                } else if (isStretched) {
                    sLerp = kCfg.kinematicSmoothLerpStretch ?? 0.16;
                    maxStep = scale(kCfg.kinematicSmoothMaxStep ?? 2.2);
                } else {
                    sLerp = kCfg.kinematicSmoothLerp ?? 0.14;
                    maxStep = scale(kCfg.kinematicSmoothMaxStep ?? 2.2);
                }
                const entryMul = this._kinematicEntryTicks > 0 ? 1.8 : 1;
                const blockMul = activeBlockCount >= 7
                    ? (kCfg.kinematicBlock7StepMul ?? 1.3) : 1;
                const transMul = this._orbitTransitionTicks > 0 ? 1.4 : 1;
                const smoothLag = Math.hypot(
                    d.overrideTarget.x - d.smoothTarget.x,
                    d.overrideTarget.y - d.smoothTarget.y
                );
                if (smoothLag > scale(22)) {
                    sLerp = Math.min(0.42, sLerp * 2.2);
                    maxStep *= 1.6;
                }
                const stepCap = this.kinematicAdaptiveMaxStep(
                    maxStep * entryMul * blockMul * transMul, smoothLag, kCfg
                );
                const next = this.kinematicLerpToward(
                    d.smoothTarget.x, d.smoothTarget.y,
                    d.overrideTarget.x, d.overrideTarget.y,
                    sLerp, stepCap
                );
                d.smoothTarget.x = next.x;
                d.smoothTarget.y = next.y;
                return;
            }

            const isStretched = this.stretchedNotes.has(d.noteIndex);

            if (isStretched && activeBlockCount >= 5) {
                const stretchLag = Math.hypot(
                    d.overrideTarget.x - d.smoothTarget.x,
                    d.overrideTarget.y - d.smoothTarget.y
                );
                if (stretchLag > scale(10)) {
                    d.smoothTarget.x = d.overrideTarget.x;
                    d.smoothTarget.y = d.overrideTarget.y;
                    return;
                }
            }

            if (activeBlockCount >= 5) {
                const lag = Math.hypot(
                    d.overrideTarget.x - d.smoothTarget.x,
                    d.overrideTarget.y - d.smoothTarget.y
                );
                if (lag > scale(18)) {
                    if (activeBlockCount === 5) {
                        d.smoothTarget.x = d.overrideTarget.x;
                        d.smoothTarget.y = d.overrideTarget.y;
                    } else {
                        const catchLerp = 0.22;
                        d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * catchLerp;
                        d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * catchLerp;
                    }
                    return;
                }
                if (lag > scale(5)) {
                    const heavyLerp = this.getHeavyTargetLerp(activeBlockCount);
                    let catchLerp = heavyLerp != null
                        ? Math.min(0.14, heavyLerp * 5)
                        : 0.12;
                    if (activeBlockCount >= 6) {
                        catchLerp = Math.max(catchLerp, 0.22);
                    }
                    d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * catchLerp;
                    d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * catchLerp;
                    return;
                }
            }

            if (isStretched && activeBlockCount < 2) {
                d.smoothTarget.x = d.overrideTarget.x;
                d.smoothTarget.y = d.overrideTarget.y;
                return;
            }

            if (isStretched) {
                if (activeBlockCount >= 6) {
                    const stretchLag = Math.hypot(
                        d.overrideTarget.x - d.smoothTarget.x,
                        d.overrideTarget.y - d.smoothTarget.y
                    );
                    if (stretchLag > scale(18)) {
                        d.smoothTarget.x = d.overrideTarget.x;
                        d.smoothTarget.y = d.overrideTarget.y;
                        return;
                    }
                }
                const heavyLerp = this.getHeavyTargetLerp(activeBlockCount);
                const stretchLerp = heavyLerp != null
                    ? heavyLerp * 1.15
                    : (smoothCfg.multiBlock ?? 0.1) * 0.75;
                d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * stretchLerp;
                d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * stretchLerp;
                return;
            }

            const jump = Math.hypot(
                d.overrideTarget.x - d.smoothTarget.x,
                d.overrideTarget.y - d.smoothTarget.y
            );
            if (jump > smoothCfg.stretchJumpReset) {
                if (activeBlockCount >= 2) {
                    const heavyLerp = this.getHeavyTargetLerp(activeBlockCount);
                    const catchUp = heavyLerp != null
                        ? Math.min(0.18, heavyLerp * 3)
                        : Math.min(0.28, (smoothCfg.multiBlock ?? 0.1) * 2.2);
                    d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * catchUp;
                    d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * catchUp;
                } else {
                    d.smoothTarget.x = d.overrideTarget.x;
                    d.smoothTarget.y = d.overrideTarget.y;
                }
                return;
            }

            let lerp;
            if (blocksDragging) {
                lerp = smoothCfg.dragBlock ?? 0.28;
            } else {
                const heavyLerp = this.getHeavyTargetLerp(activeBlockCount);
                lerp = heavyLerp != null
                    ? heavyLerp
                    : (activeBlockCount >= 2 ? smoothCfg.multiBlock : smoothCfg.singleBlock);
            }
            d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * lerp;
            d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * lerp;
        });

        if (activeBlockCount >= 6 && !kinematic) {
            let postSmoothMaxLag = 0;
            bodiesData.forEach(d => {
                if (!d.overrideTarget || !d.smoothTarget) return;
                const lag = Math.hypot(
                    d.overrideTarget.x - d.smoothTarget.x,
                    d.overrideTarget.y - d.smoothTarget.y
                );
                if (lag > postSmoothMaxLag) postSmoothMaxLag = lag;
                if (lag > scale(10)) {
                    d.smoothTarget.x = d.overrideTarget.x;
                    d.smoothTarget.y = d.overrideTarget.y;
                }
            });
            window.__physDbgLag = { postSmoothMaxLag, ts: performance.now() };
        } else if (kinematic) {
            let postSmoothMaxLag = 0;
            bodiesData.forEach(d => {
                if (!d.overrideTarget || !d.smoothTarget) return;
                const lag = Math.hypot(
                    d.overrideTarget.x - d.smoothTarget.x,
                    d.overrideTarget.y - d.smoothTarget.y
                );
                if (lag > postSmoothMaxLag) postSmoothMaxLag = lag;
            });
            window.__physDbgLag = { postSmoothMaxLag, ts: performance.now() };
        }
    },

    // Bounding radius of a full molecule (anchor + sibling fan + cluster + outline)
    noteMoleculeExtent(bodiesData, noteIndex, cfg) {
        const bodyR = CONFIG.physics.body.radius;
        const pad = CONFIG.outlines.padding;
        const dotCount = bodiesData.filter(d => d.noteIndex === noteIndex).length;
        const siblingCount = Math.max(0, dotCount - 1);

        let reach = bodyR + pad;
        if (siblingCount > 0) {
            const maxRing = 1 + Math.floor((siblingCount - 1) / cfg.siblingsPerRing);
            reach = Math.max(
                reach,
                cfg.ringSpacing * maxRing + cfg.groupArcSpacing + bodyR * 2 + pad
            );
        }

        if (dotCount > 1) {
            const clusterCfg = CONFIG.physics.cluster;
            const clusterR = clusterCfg.baseRadius + dotCount * clusterCfg.radiusPerDot;
            reach = Math.max(reach, clusterR + bodyR + pad);
        }

        return Math.max(
            cfg.moleculeFootprint,
            reach,
            cfg.moleculeFootprint + siblingCount * cfg.footprintPerSibling
        );
    },

    // Extra radius for slots facing away from the canvas center (peek past screen edge)
    outwardPeekExtension(block, angle, cfg) {
        const app = document.getElementById('app');
        if (!app) return 0;

        const rect = app.getBoundingClientRect();
        const cx = rect.left + window.pageXOffset + rect.width / 2;
        const cy = rect.top + window.pageYOffset + rect.height / 2;
        const outward = Math.cos(angle - Math.atan2(cy - block.bodyY, cx - block.bodyX));
        if (outward < cfg.edgePeekThreshold) return 0;

        const t = (outward - cfg.edgePeekThreshold) / (1 - cfg.edgePeekThreshold);
        return t * cfg.edgePeekExtension;
    },

    blendAngle(prev, next, blend) {
        let diff = next - prev;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return prev + diff * blend;
    },

    // Enforce minimum arc gap between neighbours on the ring (angular, not radial)
    spreadRingAngles(angles, footprints, innerRadius, cfg) {
        const n = angles.length;
        if (n < 2) return angles.slice();

        const items = angles.map((angle, i) => ({
            angle,
            footprint: footprints[i],
            index: i
        })).sort((a, b) => a.angle - b.angle);

        const maxPasses = 12;
        const pushRatio = 0.5;
        const safeRadius = Math.max(innerRadius, 1);

        for (let pass = 0; pass < maxPasses; pass++) {
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const a = items[i];
                const b = items[j];
                let gap = b.angle - a.angle;
                if (i === n - 1) gap = (b.angle + Math.PI * 2) - a.angle;
                const minGap = (a.footprint + b.footprint + cfg.moleculeGap) / safeRadius;
                if (gap >= minGap) continue;
                const push = (minGap - gap) * pushRatio;
                a.angle -= push;
                b.angle += push;
            }
        }

        const sorted = angles.map((_, i) => {
            const item = items.find(it => it.index === i);
            return item ? item.angle : angles[i];
        });
        return sorted;
    },

    clampAnglesToOwnershipArc(angles, ownershipArc) {
        if (!ownershipArc.partial) return angles;
        const { center, span } = ownershipArc;
        const half = span / 2;
        return angles.map(angle => {
            let rel = angle - center;
            while (rel > Math.PI) rel -= Math.PI * 2;
            while (rel < -Math.PI) rel += Math.PI * 2;
            rel = Math.max(-half, Math.min(half, rel));
            return center + rel;
        });
    },

    // Push crowded anchors apart; separation stays mostly tangential to keep the ring tight
    relaxMoleculeCluster(molecules, block, cfg, relaxScale = 1) {
        const tangential = cfg.tangentialPushRatio;
        const radialMix = 1 - tangential;
        const iterations = Math.max(3, Math.floor(cfg.clusterRelaxIterations * relaxScale));

        for (let n = 0; n < iterations; n++) {
            for (let i = 0; i < molecules.length; i++) {
                for (let j = i + 1; j < molecules.length; j++) {
                    const a = molecules[i];
                    const b = molecules[j];
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    const dist = Math.hypot(dx, dy) || 0.01;
                    const minD = a.footprint + b.footprint + cfg.moleculeGap;
                    if (dist >= minD) continue;

                    const push = (minD - dist) * 0.5;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    [a, b].forEach((m, idx) => {
                        const sign = idx === 0 ? -1 : 1;
                        const rx = m.x - block.bodyX;
                        const ry = m.y - block.bodyY;
                        const rLen = Math.hypot(rx, ry) || 1;
                        const rux = rx / rLen;
                        const ruy = ry / rLen;
                        const tux = -ruy;
                        const tuy = rux;
                        const pTan = (nx * tux + ny * tuy) * tangential;
                        const pRad = (nx * rux + ny * ruy) * radialMix * 0.35;
                        m.x += sign * push * (tux * pTan + rux * pRad);
                        m.y += sign * push * (tuy * pTan + ruy * pRad);
                    });
                }
            }

            molecules.forEach(m => {
                let dx = m.x - block.bodyX;
                let dy = m.y - block.bodyY;
                let dist = Math.hypot(dx, dy) || 1;
                const minR = Math.max(m.targetR * cfg.radialClampMin, this.orbitFloor(cfg, block));
                const maxR = m.maxTargetR * cfg.radialClampMax;
                dist = Math.max(minR, Math.min(maxR, dist));
                m.x = block.bodyX + (dx / dist) * dist;
                m.y = block.bodyY + (dy / dist) * dist;
            });
        }

        this.nudgeOutwardPeek(molecules, block, cfg);
    },

    findOwningBlock(molecule) {
        const sample = molecule.dots[0];
        if (!sample) return null;
        return this.blocks.find(b => {
            if (b.state !== 'active') return false;
            return molecule.dots.some(d => this.dotMatchesBlock(b, d));
        }) || null;
    },

    // Pass 4: translate whole captured molecules so their hulls no longer overlap
    relaxCapturedMolecules(bodiesData, cfg) {
        const activeBlockCount = this.getCrowdedBlockCount();
        if (activeBlockCount >= 6) return;
        const groups = new Map();
        bodiesData.forEach(d => {
            if (!d.overrideTarget) return;
            if (!groups.has(d.noteIndex)) groups.set(d.noteIndex, []);
            groups.get(d.noteIndex).push(d);
        });
        if (groups.size < 2) return;

        const molecules = [...groups.entries()]
            .filter(([noteIndex]) => !this.stretchedNotes.has(noteIndex))
            .map(([noteIndex, dots]) => {
            let cx = 0;
            let cy = 0;
            dots.forEach(d => {
                cx += d.overrideTarget.x;
                cy += d.overrideTarget.y;
            });
            cx /= dots.length;
            cy /= dots.length;
            return {
                noteIndex,
                dots,
                cx,
                cy,
                offsets: dots.map(d => ({
                    dx: d.overrideTarget.x - cx,
                    dy: d.overrideTarget.y - cy
                })),
                radius: this.noteMoleculeExtent(bodiesData, noteIndex, cfg)
            };
        });

        const applyPositions = (m) => {
            m.dots.forEach((d, k) => {
                d.overrideTarget.x = m.cx + m.offsets[k].dx;
                d.overrideTarget.y = m.cy + m.offsets[k].dy;
            });
        };

        const bodyR = CONFIG.physics.body.radius;
        const shellR = bodyR + CONFIG.outlines.padding;
        const dotMin = shellR * 2 + cfg.dotSeparationGap;
        const hullGap = CONFIG.physics.hullCollision.gap;
        let iterations;
        let pushScale;
        let tugScale;

        if (activeBlockCount >= 2) {
            iterations = Math.max(8, Math.floor(cfg.moleculeRelaxIterations * 0.45));
            pushScale = 0.35;
            tugScale = 0.22;
            if (activeBlockCount >= 4) {
                pushScale *= 0.62;
                tugScale *= 0.55;
            }
            if (activeBlockCount >= 5) {
                pushScale *= 0.72;
                tugScale *= 0.65;
            }
            if (activeBlockCount >= 7) {
                pushScale *= 0.55;
                tugScale *= 0.5;
            }
        } else if (activeBlockCount === 1) {
            iterations = Math.max(4, Math.floor(cfg.moleculeRelaxIterations * cfg.singleBlockRelaxScale));
            pushScale = 0.22;
            tugScale = 0.15;
        } else {
            iterations = cfg.moleculeRelaxIterations;
            pushScale = 0.55;
            tugScale = 0.5;
        }

        for (let pass = 0; pass < iterations; pass++) {
            for (let i = 0; i < molecules.length; i++) {
                for (let j = i + 1; j < molecules.length; j++) {
                    const a = molecules[i];
                    const b = molecules[j];
                    let dx = b.cx - a.cx;
                    let dy = b.cy - a.cy;
                    const dist = Math.hypot(dx, dy) || 0.01;
                    const minD = a.radius + b.radius + Math.max(cfg.moleculeGap, hullGap);
                    if (dist >= minD) continue;

                    const push = (minD - dist) * pushScale;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const ownA = this.findOwningBlock(a);
                    const ownB = this.findOwningBlock(b);

                    if (ownA && ownB && ownA !== ownB) {
                        const tug = tugScale;
                        const aTo = Math.hypot(ownA.bodyX - a.cx, ownA.bodyY - a.cy) || 1;
                        const bTo = Math.hypot(ownB.bodyX - b.cx, ownB.bodyY - b.cy) || 1;
                        a.cx += (ownA.bodyX - a.cx) / aTo * push * tug - nx * push * (1 - tug);
                        a.cy += (ownA.bodyY - a.cy) / aTo * push * tug - ny * push * (1 - tug);
                        b.cx += (ownB.bodyX - b.cx) / bTo * push * tug + nx * push * (1 - tug);
                        b.cy += (ownB.bodyY - b.cy) / bTo * push * tug + ny * push * (1 - tug);
                    } else {
                        a.cx -= nx * push;
                        a.cy -= ny * push;
                        b.cx += nx * push;
                        b.cy += ny * push;
                    }
                }
            }

            molecules.forEach(applyPositions);

            for (let i = 0; i < molecules.length; i++) {
                for (let j = i + 1; j < molecules.length; j++) {
                    const molA = molecules[i];
                    const molB = molecules[j];
                    for (const dotA of molA.dots) {
                        for (const dotB of molB.dots) {
                            let dx = dotB.overrideTarget.x - dotA.overrideTarget.x;
                            let dy = dotB.overrideTarget.y - dotA.overrideTarget.y;
                            const dist = Math.hypot(dx, dy) || 0.01;
                            if (dist >= dotMin) continue;
                            const dotPush = activeBlockCount === 1 ? 0.22 : 0.35;
                            const push = (dotMin - dist) * dotPush;
                            const nx = dx / dist;
                            const ny = dy / dist;
                            dotA.overrideTarget.x -= nx * push;
                            dotA.overrideTarget.y -= ny * push;
                            dotB.overrideTarget.x += nx * push;
                            dotB.overrideTarget.y += ny * push;
                        }
                    }
                }
            }

            molecules.forEach(m => {
                let cx = 0;
                let cy = 0;
                m.dots.forEach(d => {
                    cx += d.overrideTarget.x;
                    cy += d.overrideTarget.y;
                });
                m.cx = cx / m.dots.length;
                m.cy = cy / m.dots.length;
                m.offsets = m.dots.map(d => ({
                    dx: d.overrideTarget.x - m.cx,
                    dy: d.overrideTarget.y - m.cy
                }));
            });
        }

        molecules.forEach(applyPositions);
    },

    // Pull outer slots until they sit slightly past the canvas edge (single/dual block only)
    nudgeOutwardPeek(molecules, block, cfg) {
        const app = document.getElementById('app');
        if (!app) return;

        const rect = app.getBoundingClientRect();
        const left = rect.left + window.pageXOffset;
        const right = left + rect.width;
        const top = rect.top + window.pageYOffset;
        const bottom = top + rect.height;
        const pad = CONFIG.navigation.contentPadding;

        molecules.forEach(m => {
            if (m.peekExtend <= 0) return;
            const dx = m.x - block.bodyX;
            const dy = m.y - block.bodyY;
            const dist = Math.hypot(dx, dy) || 1;
            const ux = dx / dist;
            const uy = dy / dist;

            if (ux < -0.25) {
                const goalX = left - cfg.edgePeekPast;
                if (m.x > goalX) {
                    const need = (m.x - goalX) / Math.max(Math.abs(ux), 0.2);
                    const nextR = Math.min(m.maxTargetR, dist + need);
                    m.x = block.bodyX + ux * nextR;
                    m.y = block.bodyY + uy * nextR;
                }
            } else if (ux > 0.25) {
                const goalX = right + cfg.edgePeekPast;
                if (m.x < goalX) {
                    const need = (goalX - m.x) / Math.max(Math.abs(ux), 0.2);
                    const nextR = Math.min(m.maxTargetR, dist + need);
                    m.x = block.bodyX + ux * nextR;
                    m.y = block.bodyY + uy * nextR;
                }
            }

            m.x = Math.max(left + pad, Math.min(right - pad, m.x));
            m.y = Math.max(top + pad, Math.min(bottom - pad, m.y));
        });
    },

    // Minimum orbit radius from block center (pill hull + dot + clearance)
    orbitFloor(cfg, block) {
        const dotR = CONFIG.physics.body.radius;
        const blockR = block
            ? this.getBlockCollisionRadius(block)
            : scale(CONFIG.warehouse.blockHeight) / 2;
        const clearance = cfg.orbitCaptureClearance ?? cfg.blockClearance;
        return blockR + dotR + clearance;
    },

    // When blocks sit close, each block's molecules occupy the far hemisphere only
    resolveOwnershipArc(block, activeBlocks, cfg) {
        const others = activeBlocks.filter(b => b !== block);
        if (others.length === 0) return { partial: false };

        let nearest = null;
        let nearestDist = Infinity;
        others.forEach(other => {
            const d = Math.hypot(other.bodyX - block.bodyX, other.bodyY - block.bodyY);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = other;
            }
        });

        if (!nearest || nearestDist > cfg.foreignBlockRepulsion) {
            return { partial: false };
        }

        const toOther = Math.atan2(
            nearest.bodyY - block.bodyY,
            nearest.bodyX - block.bodyX
        );
        const center = toOther + Math.PI;
        const closeness = 1 - nearestDist / cfg.foreignBlockRepulsion;
        const minArc = Math.PI * cfg.blockOwnershipArcMin;
        const span = Math.PI * 2 - closeness * (Math.PI * 2 - minArc);

        return { partial: true, center, span, closeness };
    },

    // Push orbit targets away from foreign block hulls (and own block if too tight)
    enforceBlockClearance(bodiesData, cfg) {
        const activeBlocks = this.getActiveCaptureBlocks();
        if (activeBlocks.length === 0) return;

        const blockBodyR = scale(CONFIG.warehouse.blockHeight) / 2;
        const blockCount = activeBlocks.length;
        let foreignPushScale = 1;
        let maxPush = scale(14);
        if (blockCount >= 7) {
            foreignPushScale = 0.32;
            maxPush = scale(4);
        } else if (blockCount >= 5) {
            foreignPushScale = 0.42;
            maxPush = scale(6);
        } else if (blockCount >= 4) {
            foreignPushScale = 0.5;
            maxPush = scale(8);
        } else if (blockCount >= 3) {
            foreignPushScale = 0.68;
        }

        bodiesData.forEach(dot => {
            if (!dot.overrideTarget) return;
            if (this.stretchedNotes.has(dot.noteIndex)) return;

            let bestPush = 0;
            let bestNx = 0;
            let bestNy = 0;
            const skipForeign = blockCount >= 5;

            activeBlocks.forEach(block => {
                const dx = dot.overrideTarget.x - block.bodyX;
                const dy = dot.overrideTarget.y - block.bodyY;
                const dist = Math.hypot(dx, dy) || 0.01;
                const isOwnTag = ActionWarehouse.dotMatchesBlock(block, dot);
                if (skipForeign && !isOwnTag) return;

                const required = isOwnTag
                    ? this.orbitFloor(cfg, block)
                    : blockBodyR +
                      this.noteMoleculeExtent(bodiesData, dot.noteIndex, cfg) +
                      cfg.blockClearance;

                if (dist < required) {
                    let push = Math.min(required - dist, maxPush);
                    if (!isOwnTag) push *= foreignPushScale;
                    if (push > bestPush) {
                        bestPush = push;
                        bestNx = dx / dist;
                        bestNy = dy / dist;
                    }
                }
            });

            if (bestPush > 0) {
                dot.overrideTarget.x += bestNx * bestPush;
                dot.overrideTarget.y += bestNy * bestPush;
            }
        });
    },

    // --- Stretch binding (phase 1): stable block-pair + anchor dots across frames ---

    isStretchEndpointBlock(noteIndex, block) {
        const binding = this.stretchBindingByNote.get(noteIndex);
        if (!binding) return false;
        if (binding.mode === 'multi') {
            return binding.anchors.some(a => a.block === block);
        }
        return block === binding.blockA || block === binding.blockB;
    },

    getStretchGroupKey(binding) {
        if (!binding) return '';
        if (binding.mode === 'multi') {
            return binding.anchors
                .map(a => this.getBlockRingKey(a.block))
                .sort()
                .join('::');
        }
        return [this.getBlockRingKey(binding.blockA), this.getBlockRingKey(binding.blockB)]
            .sort()
            .join('::');
    },

    pruneStretchBindings(activeBlocks) {
        const activeSet = new Set(activeBlocks);
        this.stretchBindingByNote.forEach((binding, noteIndex) => {
            let blocksOk;
            let dotsOk;
            let tagsOk;
            if (binding.mode === 'multi') {
                blocksOk = binding.anchors.every(a => activeSet.has(a.block));
                dotsOk = binding.anchors.every(a => a.dot?.body);
                tagsOk = binding.anchors.every(a =>
                    this.dotMatchesBlock(a.block, a.dot));
            } else {
                blocksOk = activeSet.has(binding.blockA) && activeSet.has(binding.blockB);
                dotsOk = binding.dotA?.body && binding.dotB?.body;
                tagsOk = this.dotMatchesBlock(binding.blockA, binding.dotA) &&
                    this.dotMatchesBlock(binding.blockB, binding.dotB);
            }
            if (!this.stretchedNotes.has(noteIndex) || !blocksOk || !dotsOk || !tagsOk) {
                this.stretchBindingByNote.delete(noteIndex);
            }
        });
    },

    // First dot in bodiesData order matching the block tag — never body.position
    pickStableAnchorDot(block, bodiesData, noteIndex) {
        if (block.type === 'author') {
            return bodiesData.find(d => d.noteIndex === noteIndex) || null;
        }
        return bodiesData.find(d => d.noteIndex === noteIndex && d.tag === block.tag) || null;
    },

    // Pair from blocks that actually capture this note; stable tie-break by tag name
    resolveStretchBlockPair(blocks) {
        if (blocks.length < 2) return null;

        const tagSort = (a, b) => this.getBlockRingKey(a).localeCompare(this.getBlockRingKey(b));
        const orient = (bA, bB) => (tagSort(bA, bB) <= 0 ? { bA, bB } : { bA: bB, bB: bA });

        if (blocks.length === 2) return orient(blocks[0], blocks[1]);

        let best = null;
        let bestDist = -1;
        for (let i = 0; i < blocks.length; i++) {
            for (let j = i + 1; j < blocks.length; j++) {
                const dist = Math.hypot(
                    blocks[j].bodyX - blocks[i].bodyX,
                    blocks[j].bodyY - blocks[i].bodyY
                );
                const pair = orient(blocks[i], blocks[j]);
                const key = [this.getBlockRingKey(pair.bA), this.getBlockRingKey(pair.bB)].join('::');
                const bestKey = best ? [this.getBlockRingKey(best.bA), this.getBlockRingKey(best.bB)].join('::') : '';
                if (dist > bestDist + 0.01 || (Math.abs(dist - bestDist) < 0.01 && key < bestKey)) {
                    bestDist = dist;
                    best = pair;
                }
            }
        }
        return best;
    },

    ensureStretchBinding(noteIndex, anchors, bodiesData, activeBlocks) {
        const activeSet = new Set(activeBlocks);
        let binding = this.stretchBindingByNote.get(noteIndex);

        const sortedAnchors = anchors
            .filter(a => activeSet.has(a.block) && a.dot?.body)
            .slice()
            .sort((a, b) =>
                this.getBlockRingKey(a.block).localeCompare(this.getBlockRingKey(b.block)));

        if (sortedAnchors.length >= 3) {
            const multiValid = binding &&
                binding.mode === 'multi' &&
                binding.anchors.length === sortedAnchors.length &&
                binding.anchors.every((entry, i) =>
                    entry.block === sortedAnchors[i].block &&
                    entry.dot === sortedAnchors[i].dot);

            if (multiValid) return binding;

            const prevLane = binding?.slotLane ?? 0;
            binding = {
                mode: 'multi',
                anchors: sortedAnchors,
                slotLane: prevLane,
                isNew: true
            };
            this.stretchBindingByNote.set(noteIndex, binding);
            return binding;
        }

        const blocks = [];
        sortedAnchors.forEach(({ block }) => {
            if (!blocks.includes(block)) blocks.push(block);
        });

        const bindingValid = binding &&
            binding.mode !== 'multi' &&
            activeSet.has(binding.blockA) &&
            activeSet.has(binding.blockB) &&
            binding.dotA?.body &&
            binding.dotB?.body &&
            this.dotMatchesBlock(binding.blockA, binding.dotA) &&
            this.dotMatchesBlock(binding.blockB, binding.dotB);

        if (bindingValid) return binding;

        const pair = this.resolveStretchBlockPair(blocks);
        if (!pair) return null;

        const dotA = this.pickStableAnchorDot(pair.bA, bodiesData, noteIndex);
        const dotB = this.pickStableAnchorDot(pair.bB, bodiesData, noteIndex);
        if (!dotA || !dotB) return null;

        const prevLane = binding?.slotLane ?? 0;
        binding = {
            mode: 'pair',
            blockA: pair.bA,
            blockB: pair.bB,
            dotA,
            dotB,
            slotLane: prevLane,
            isNew: true
        };
        this.stretchBindingByNote.set(noteIndex, binding);
        return binding;
    },

    // Assign base slot lanes when a binding is new or group membership changes
    assignStretchSlotLanes(cfg) {
        const groups = new Map();
        const blockCount = this.getCrowdedBlockCount();
        const laneLerp = blockCount >= 6 ? 0.45 : (blockCount >= 5 ? 0.5 : 1);

        this.stretchedNotes.forEach(noteIndex => {
            const binding = this.stretchBindingByNote.get(noteIndex);
            if (!binding) return;
            const key = this.getStretchGroupKey(binding);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(noteIndex);
        });

        const spacingBase = cfg.stretchLaneSpacing * 0.5;
        const hullGap = CONFIG.physics.hullCollision.gap;
        const bodiesData = PhysicsEngine.bodiesData;

        groups.forEach((noteIndices, key) => {
            const sorted = noteIndices.slice().sort((a, b) => a - b);
            const n = sorted.length;
            const prevCount = this.stretchGroupCounts.get(key) || 0;
            const rebalance = prevCount !== n ||
                sorted.some(id => this.stretchBindingByNote.get(id)?.isNew);
            this.stretchGroupCounts.set(key, n);

            let maxExtent = cfg.moleculeFootprint;
            sorted.forEach(noteIndex => {
                maxExtent = Math.max(
                    maxExtent,
                    this.noteMoleculeExtent(bodiesData, noteIndex, cfg)
                );
            });
            const spacing = Math.max(spacingBase, maxExtent * 2 + hullGap);
            let groupLaneLerp = laneLerp;
            if (rebalance && blockCount >= 6) {
                groupLaneLerp = 0.28;
            }

            if (!rebalance && n > 1) {
                sorted.forEach(noteIndex => {
                    const binding = this.stretchBindingByNote.get(noteIndex);
                    if (!binding) return;
                    const idx = sorted.indexOf(noteIndex);
                    const targetLane = (idx - (n - 1) / 2) * spacing;
                    if (Math.abs(binding.slotLane - targetLane) > spacing * 0.25) {
                        if (groupLaneLerp < 1) {
                            binding.slotLane += (targetLane - binding.slotLane) * groupLaneLerp;
                        } else {
                            binding.slotLane = targetLane;
                        }
                        binding.slotLane = this.clampStretchLane(binding.slotLane, cfg);
                    }
                });
                return;
            }

            sorted.forEach((noteIndex, i) => {
                const binding = this.stretchBindingByNote.get(noteIndex);
                if (!binding) return;
                const targetLane = n === 1 ? 0 : (i - (n - 1) / 2) * spacing;
                if (groupLaneLerp < 1 && !binding.isNew) {
                    binding.slotLane += (targetLane - binding.slotLane) * groupLaneLerp;
                } else if (groupLaneLerp < 1) {
                    binding.slotLane += (targetLane - binding.slotLane) * groupLaneLerp;
                } else {
                    binding.slotLane = targetLane;
                }
                binding.slotLane = this.clampStretchLane(binding.slotLane, cfg);
                binding.isNew = false;
            });
        });
    },

    computeStretchChordGeometry(bA, bB, cfg) {
        const dx = bB.bodyX - bA.bodyX;
        const dy = bB.bodyY - bA.bodyY;
        const segLen = Math.hypot(dx, dy) || 1;
        const ux = dx / segLen;
        const uy = dy / segLen;
        const px = -uy;
        const py = ux;

        const dotR = CONFIG.physics.body.radius;
        const pillPad = cfg.stretchPillClearance;
        const minAlongA = this.getBlockCollisionRadius(bA) + dotR + pillPad;
        const minAlongB = this.getBlockCollisionRadius(bB) + dotR + pillPad;
        const inset = cfg.stretchChordInset;

        // Usable chord span (pill clearance only — detached from orbit ring)
        let alongA = segLen * inset;
        let alongB = segLen * (1 - inset);
        alongA = Math.max(minAlongA, alongA);
        alongB = Math.min(segLen - minAlongB, alongB);

        const minMidGap = Math.max(scale(12), segLen * 0.08);
        if (alongB - alongA < minMidGap) {
            const mid = segLen * 0.5;
            alongA = Math.max(minAlongA, mid - minMidGap * 0.5);
            alongB = Math.min(segLen - minAlongB, mid + minMidGap * 0.5);
        }

        const midAlong = segLen * 0.5;
        const stretchHalf = Math.min(
            cfg.stretchCenterSpan,
            Math.max(scale(5), (alongB - alongA) * 0.14)
        );
        let centerAlong = midAlong;
        centerAlong = Math.max(alongA + stretchHalf, Math.min(alongB - stretchHalf, centerAlong));

        return {
            bA, bB, ux, uy, px, py, segLen,
            midX: bA.bodyX + ux * midAlong,
            midY: bA.bodyY + uy * midAlong,
            alongA, alongB, centerAlong, stretchHalf
        };
    },

    // 3+ blocks: anchors on rays toward centroid; siblings at equilibrium center
    layoutMultiBlockStretch(noteIndex, binding, bodiesData, cfg) {
        const { anchors, slotLane } = binding;
        const blocks = anchors.map(a => a.block);
        let cx = 0;
        let cy = 0;
        blocks.forEach(b => { cx += b.bodyX; cy += b.bodyY; });
        cx /= blocks.length;
        cy /= blocks.length;

        const b0 = blocks[0];
        const dx0 = cx - b0.bodyX;
        const dy0 = cy - b0.bodyY;
        const len0 = Math.hypot(dx0, dy0) || 1;
        const ux = dx0 / len0;
        const uy = dy0 / len0;
        const px = -uy;
        const py = ux;
        const reach = cfg.stretchAnchorReach ?? 0.3;

        this.stretchAxisByNote.set(noteIndex, {
            mode: 'multi',
            cx, cy, ux, uy, px, py, blocks
        });

        binding.localOffsets = [];

        anchors.forEach(({ block, dot }) => {
            let dx = cx - block.bodyX;
            let dy = cy - block.bodyY;
            const dist = Math.hypot(dx, dy) || 1;
            dx /= dist;
            dy /= dist;
            const floor = this.orbitFloor(cfg, block);
            const placeDist = Math.max(
                floor,
                Math.min(dist - scale(6), floor + (dist - floor) * (1 - reach * 0.65))
            );
            const tx = block.bodyX + dx * placeDist + px * slotLane;
            const ty = block.bodyY + dy * placeDist + py * slotLane;
            dot.overrideTarget = { x: tx, y: ty };
            binding.localOffsets.push({ dot, isAnchor: true });
        });

        const placed = new Set(anchors.map(a => a.dot));
        const siblings = bodiesData.filter(d => d.noteIndex === noteIndex && !placed.has(d));
        siblings.forEach((s, k) => {
            const ring = Math.floor(k / cfg.siblingsPerRing);
            const idxInRing = k % cfg.siblingsPerRing;
            const side = idxInRing === 0 ? 0 :
                Math.ceil(idxInRing / 2) * (idxInRing % 2 === 1 ? 1 : -1);
            const perp = cfg.groupArcSpacing * (1 + ring * 0.35);
            const sx = cx + px * (slotLane + side * perp);
            const sy = cy + py * (slotLane + side * perp);
            s.overrideTarget = { x: sx, y: sy };
            binding.localOffsets.push({ dot: s, isAnchor: false, perp: side * perp });
        });
    },

    // Cluster centered on chord midpoint; slotLane fans duplicates side-by-side (perpendicular)
    layoutStretchedFromBinding(noteIndex, binding, bodiesData, cfg) {
        if (binding.mode === 'multi') {
            this.layoutMultiBlockStretch(noteIndex, binding, bodiesData, cfg);
            return;
        }
        if (!binding.mode) binding.mode = 'pair';

        const { blockA: bA, blockB: bB, dotA, dotB, slotLane } = binding;
        const chord = this.computeStretchChordGeometry(bA, bB, cfg);
        const { ux, uy, px, py, alongA, alongB, centerAlong, stretchHalf } = chord;

        this.stretchAxisByNote.set(noteIndex, { mode: 'pair', ...chord, slotLane });

        const reach = cfg.stretchAnchorReach ?? 0.3;
        const anchorAAlong = (centerAlong - stretchHalf) + (alongA - (centerAlong - stretchHalf)) * reach;
        const anchorBAlong = (centerAlong + stretchHalf) + (alongB - (centerAlong + stretchHalf)) * reach;

        const placeOnChord = (dot, along, perp) => {
            dot.overrideTarget = {
                x: bA.bodyX + ux * along + px * (perp + slotLane),
                y: bA.bodyY + uy * along + py * (perp + slotLane)
            };
        };

        placeOnChord(dotA, anchorAAlong, 0);
        placeOnChord(dotB, anchorBAlong, 0);

        binding.localOffsets = [
            { dot: dotA, isAnchor: true, along: anchorAAlong, perp: 0 },
            { dot: dotB, isAnchor: true, along: anchorBAlong, perp: 0 }
        ];

        const placed = new Set([dotA, dotB]);
        const siblings = bodiesData.filter(d => d.noteIndex === noteIndex && !placed.has(d));
        siblings.forEach((s, k) => {
            const ring = Math.floor(k / cfg.siblingsPerRing);
            const idxInRing = k % cfg.siblingsPerRing;
            const side = idxInRing === 0 ? 0 :
                Math.ceil(idxInRing / 2) * (idxInRing % 2 === 1 ? 1 : -1);
            const perp = cfg.groupArcSpacing * (1 + ring * 0.35);
            placeOnChord(s, centerAlong, side * perp);
            binding.localOffsets.push({
                dot: s, isAnchor: false, along: centerAlong, perp: side * perp
            });
        });
    },

    applyBindingOffsets(noteIndex, binding) {
        const axis = this.stretchAxisByNote.get(noteIndex);
        if (!axis || !binding.localOffsets) return;

        if (binding.mode === 'multi') {
            const cfg = CONFIG.warehouse.orbit;
            const reach = cfg.stretchAnchorReach ?? 0.3;
            const { slotLane } = binding;
            const blocks = binding.anchors.map(a => a.block);
            let cx = 0;
            let cy = 0;
            blocks.forEach(b => { cx += b.bodyX; cy += b.bodyY; });
            cx /= blocks.length;
            cy /= blocks.length;

            const b0 = blocks[0];
            const dx0 = cx - b0.bodyX;
            const dy0 = cy - b0.bodyY;
            const len0 = Math.hypot(dx0, dy0) || 1;
            const px = -dy0 / len0;
            const py = dx0 / len0;

            axis.cx = cx;
            axis.cy = cy;
            axis.px = px;
            axis.py = py;

            binding.anchors.forEach(({ block, dot }) => {
                let dx = cx - block.bodyX;
                let dy = cy - block.bodyY;
                const dist = Math.hypot(dx, dy) || 1;
                dx /= dist;
                dy /= dist;
                const floor = this.orbitFloor(cfg, block);
                const placeDist = Math.max(
                    floor,
                    Math.min(dist - scale(6), floor + (dist - floor) * (1 - reach * 0.65))
                );
                dot.overrideTarget = {
                    x: block.bodyX + dx * placeDist + px * slotLane,
                    y: block.bodyY + dy * placeDist + py * slotLane
                };
            });

            binding.localOffsets.forEach(({ dot, isAnchor, perp }) => {
                if (isAnchor) return;
                dot.overrideTarget = {
                    x: cx + px * (slotLane + (perp || 0)),
                    y: cy + py * (slotLane + (perp || 0))
                };
            });
            return;
        }

        if (!binding.mode) binding.mode = 'pair';

        const { blockA: bA, localOffsets, slotLane } = binding;
        const { ux, uy, px, py } = axis;

        localOffsets.forEach(({ dot, along, perp }) => {
            dot.overrideTarget = {
                x: bA.bodyX + ux * along + px * (perp + slotLane),
                y: bA.bodyY + uy * along + py * (perp + slotLane)
            };
        });
    },

    // Phase 2: only separate stretched molecules perpendicular to the chord
    relaxStretchedMolecules(bodiesData, cfg, iterFactor = 1) {
        const molecules = [];

        this.stretchedNotes.forEach(noteIndex => {
            const binding = this.stretchBindingByNote.get(noteIndex);
            const axis = this.stretchAxisByNote.get(noteIndex);
            if (!binding || !axis || !binding.localOffsets) return;

            molecules.push({
                noteIndex,
                binding,
                axis,
                pairKey: this.getStretchGroupKey(binding),
                radius: this.noteMoleculeExtent(bodiesData, noteIndex, cfg),
                cx: axis.mode === 'multi'
                    ? axis.cx + axis.px * binding.slotLane
                    : axis.bA.bodyX + axis.ux * axis.centerAlong + axis.px * binding.slotLane,
                cy: axis.mode === 'multi'
                    ? axis.cy + axis.py * binding.slotLane
                    : axis.bA.bodyY + axis.uy * axis.centerAlong + axis.py * binding.slotLane
            });
        });

        if (molecules.length < 2) return;

        const gap = CONFIG.physics.hullCollision.gap;
        const iterations = Math.max(6, Math.floor(cfg.moleculeRelaxIterations * 0.4 * iterFactor));

        for (let pass = 0; pass < iterations; pass++) {
            for (let i = 0; i < molecules.length; i++) {
                for (let j = i + 1; j < molecules.length; j++) {
                    const a = molecules[i];
                    const b = molecules[j];
                    if (a.pairKey !== b.pairKey) continue;
                    const dx = b.cx - a.cx;
                    const dy = b.cy - a.cy;
                    const dist = Math.hypot(dx, dy) || 0.01;
                    const minD = a.radius + b.radius + gap;
                    if (dist >= minD) continue;

                    const push = (minD - dist) * 0.55;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const perpDot = nx * a.axis.px + ny * a.axis.py;
                    const perpPush = Math.abs(perpDot) < 0.05
                        ? push
                        : push * Math.sign(perpDot);

                    a.binding.slotLane -= perpPush * 0.5;
                    b.binding.slotLane += perpPush * 0.5;

                    if (a.axis.mode === 'multi') {
                        a.cx = a.axis.cx + a.axis.px * a.binding.slotLane;
                        a.cy = a.axis.cy + a.axis.py * a.binding.slotLane;
                        b.cx = b.axis.cx + b.axis.px * b.binding.slotLane;
                        b.cy = b.axis.cy + b.axis.py * b.binding.slotLane;
                    } else {
                        a.cx = a.axis.bA.bodyX + a.axis.ux * a.axis.centerAlong + a.axis.px * a.binding.slotLane;
                        a.cy = a.axis.bA.bodyY + a.axis.uy * a.axis.centerAlong + a.axis.py * a.binding.slotLane;
                        b.cx = b.axis.bA.bodyX + b.axis.ux * b.axis.centerAlong + b.axis.px * b.binding.slotLane;
                        b.cy = b.axis.bA.bodyY + b.axis.uy * b.axis.centerAlong + b.axis.py * b.binding.slotLane;
                    }
                }
            }
        }

        molecules.forEach(m => {
            this.applyBindingOffsets(m.noteIndex, m.binding);
        });
    },
    // Pass 1 — stretched notes: chord anchors near each block, siblings at midpoint.
    // Pass 2 — single-anchor notes: ring slots around each block, steered from stretch axes.
    // Pass 3 — single-anchor siblings: compact fan behind their matching dot.
    updateOrbits(bodiesData, time) {
        this.ensurePhysicsMaps();

        const prevTargets = new Map();
        const prevStretched = new Set(this.stretchedNotes);
        const prevStretchAxis = new Map(this.stretchAxisByNote);
        bodiesData.forEach(d => {
            if (d.overrideTarget) prevTargets.set(d, { x: d.overrideTarget.x, y: d.overrideTarget.y });
        });

        try {
            bodiesData.forEach(d => { d.overrideTarget = null; });
            this.stretchedNotes.clear();
            this.stretchAxisByNote.clear();

            const cfg = CONFIG.warehouse.orbit;
            const activeBlocks = this.getActiveCaptureBlocks();
            if (activeBlocks.length === 0) {
                this.stretchBindingByNote.clear();
                this.stretchGroupCounts.clear();
                this.orbitAngleByNote.clear();
                this.orbitRingCountByBlock.clear();
                return;
            }

            this._runOrbitPasses(bodiesData, time, activeBlocks, cfg);
            const blockCount = this.getCrowdedBlockCount();
            const stretchedCount = this.stretchedNotes.size;
            const nowKinematic = this.isKinematicCaptureMode(blockCount);
            const blockCountRising = this._prevOrbitBlockCount !== blockCount &&
                blockCount > this._prevOrbitBlockCount;
            if (nowKinematic && !this._prevKinematicActive) {
                const entryTotal = CONFIG.physics.crowdedBlock.kinematicEntryTicks ?? 120;
                this._kinematicEntryTicks = entryTotal;
                bodiesData.forEach(d => {
                    if (!d.overrideTarget || !d.body || d.onBankGrid) return;
                    d.smoothTarget = { x: d.body.position.x, y: d.body.position.y };
                });
            } else if (nowKinematic && blockCountRising) {
                const entryTotal = CONFIG.physics.crowdedBlock.kinematicEntryTicks ?? 120;
                this._kinematicEntryTicks = Math.max(this._kinematicEntryTicks, entryTotal);
                bodiesData.forEach(d => {
                    if (!d.overrideTarget || !d.body || d.onBankGrid) return;
                    if (!d.smoothTarget) {
                        d.smoothTarget = { x: d.body.position.x, y: d.body.position.y };
                    }
                });
            }
            this._prevKinematicActive = nowKinematic;
            if (this._kinematicEntryTicks > 0) this._kinematicEntryTicks--;
            if (this._prevOrbitBlockCount !== blockCount) {
                this._orbitTransitionTicks = blockCount >= 7 ? 200
                    : (blockCount >= 6 ? 120 : 90);
            }
            if (stretchedCount > this._prevStretchedCount) {
                const stretchTicks = blockCount >= 7 ? 150 : 90;
                this._orbitTransitionTicks = Math.max(this._orbitTransitionTicks, stretchTicks);
            }
            bodiesData.forEach(d => {
                if (!d.overrideTarget || prevTargets.has(d)) return;
                if (d.body && !d.onBankGrid) {
                    const spawnBlend = this.isKinematicCaptureMode(blockCount) ? 0.2 : 0.38;
                    d.overrideTarget.x = d.body.position.x +
                        (d.overrideTarget.x - d.body.position.x) * spawnBlend;
                    d.overrideTarget.y = d.body.position.y +
                        (d.overrideTarget.y - d.body.position.y) * spawnBlend;
                }
            });
            this.stabilizeOrbitTargets(bodiesData, prevTargets, blockCount);
            if (this._prevOrbitBlockCount !== blockCount) {
                const kBlend = CONFIG.physics.crowdedBlock.kinematicTransitionBlend ?? 0.18;
                const transitionBlend = this.isKinematicCaptureMode(blockCount)
                    ? kBlend
                    : (blockCount >= 7 ? 0.26 : (blockCount >= 6 ? 0.35 : 0.36));
                bodiesData.forEach(d => {
                    const prev = prevTargets.get(d);
                    if (!d.overrideTarget || !prev) {
                        d.smoothTarget = null;
                        return;
                    }
                    let fromX = prev.x;
                    let fromY = prev.y;
                    if (d.body && !d.onBankGrid) {
                        const anchorBlock = this.getOrbitAnchorBlock(d);
                        if (anchorBlock) {
                            const atBody = this.clampTargetToBlockRing(
                                d.body.position.x, d.body.position.y, anchorBlock
                            );
                            fromX = atBody.x;
                            fromY = atBody.y;
                        }
                    }
                    d.overrideTarget.x = fromX + (d.overrideTarget.x - fromX) * transitionBlend;
                    d.overrideTarget.y = fromY + (d.overrideTarget.y - fromY) * transitionBlend;
                    if (!(this.isKinematicCaptureMode(blockCount) && this._kinematicEntryTicks > 0)) {
                        d.smoothTarget = { x: d.overrideTarget.x, y: d.overrideTarget.y };
                    }
                });
                this._prevOrbitBlockCount = blockCount;
            }
            this.smoothOrbitTargets(bodiesData, blockCount);
            if (blockCount >= 5) {
                this.enforceCapturedRingClamp(bodiesData, blockCount);
            }
            this._prevStretchedCount = stretchedCount;
        } catch (err) {
            console.error('[ActionWarehouse] updateOrbits failed:', err);
            prevTargets.forEach((t, d) => { d.overrideTarget = t; });
            this.stretchedNotes = prevStretched;
            this.stretchAxisByNote = prevStretchAxis;
        }
    },

    _runOrbitPasses(bodiesData, time, activeBlocks, cfg) {
        const noteAnchors = new Map();
        activeBlocks.forEach(block => {
            bodiesData.forEach(d => {
                if (this.isNotePhysicsSuspended(d.noteIndex)) return;
                if (!this.dotMatchesBlock(block, d)) return;
                if (block.type === 'author') {
                    const firstOfNote = bodiesData.find(bd => bd.noteIndex === d.noteIndex);
                    if (d !== firstOfNote) return;
                }
                if (!noteAnchors.has(d.noteIndex)) noteAnchors.set(d.noteIndex, []);
                const list = noteAnchors.get(d.noteIndex);
                if (!list.some(a => a.block === block)) {
                    list.push({ block, dot: d });
                }
            });
        });

        noteAnchors.forEach((anchors, noteIndex) => {
            if (anchors.length > 1) this.stretchedNotes.add(noteIndex);
        });

        this.pruneStretchBindings(activeBlocks);

        const hasStretch = this.stretchedNotes.size > 0;
        const spin = (hasStretch || activeBlocks.length >= 2) ? 0 : time * cfg.rotationSpeed;

        // Pass 1: stable stretch bindings → layout once after lane assignment
        this.stretchedNotes.forEach(noteIndex => {
            if (this.isNotePhysicsSuspended(noteIndex)) return;
            const anchors = noteAnchors.get(noteIndex);
            if (!anchors || anchors.length < 2) return;
            this.ensureStretchBinding(noteIndex, anchors, bodiesData, activeBlocks);
        });
        this.assignStretchSlotLanes(cfg);
        if (activeBlocks.length < 6) {
            this.relaxStretchedMolecules(bodiesData, cfg);
        } else if (activeBlocks.length >= 6) {
            this.relaxStretchedMolecules(bodiesData, cfg, 0.35);
        }
        this.stretchedNotes.forEach(noteIndex => {
            if (this.isNotePhysicsSuspended(noteIndex)) return;
            const binding = this.stretchBindingByNote.get(noteIndex);
            if (binding) {
                this.layoutStretchedFromBinding(noteIndex, binding, bodiesData, cfg);
            }
        });

        // Pass 2: ring layout for single-anchor notes only
        activeBlocks.forEach(block => {
            if (!Number.isFinite(block.bodyX) || !Number.isFinite(block.bodyY)) return;

            const ringDots = block.type === 'author'
                ? this.getAuthorRingDots(block, bodiesData)
                : bodiesData.filter(d =>
                    d.tag === block.tag &&
                    !this.stretchedNotes.has(d.noteIndex) &&
                    !this.isNotePhysicsSuspended(d.noteIndex)
                );
            const ringCount = ringDots.length;
            if (ringCount === 0) return;

            const footprints = ringDots.map(d =>
                this.noteMoleculeExtent(bodiesData, d.noteIndex, cfg)
            );
            const totalArc = footprints.reduce((sum, f) => sum + f * 2 + cfg.moleculeGap, 0);
            const floor = this.orbitFloor(cfg, block);
            const innerRadius = Math.max(
                floor,
                cfg.minRadius,
                (ringCount * cfg.slotWidth) / (Math.PI * 2),
                (totalArc / (Math.PI * 2)) * cfg.arcFillScale
            );
            const reach = cfg.orbitAnchorReach ?? 0.28;
            const captureRadius = floor + (innerRadius - floor) * (1 - reach);

            const stretchAxes = [];
            this.stretchedNotes.forEach(noteIndex => {
                const anchors = noteAnchors.get(noteIndex);
                if (!anchors || anchors.length < 2) return;
                if (!anchors.some(a => a.block === block)) return;
                anchors.forEach(a => {
                    if (a.block === block) return;
                    stretchAxes.push(Math.atan2(
                        a.block.bodyY - block.bodyY,
                        a.block.bodyX - block.bodyX
                    ));
                });
            });

            const ownershipArc = this.resolveOwnershipArc(block, activeBlocks, cfg);
            let angles;
            if (ownershipArc.partial) {
                angles = ringDots.map((_, i) => {
                    const t = ringCount === 1 ? 0.5 : i / Math.max(ringCount - 1, 1);
                    return ownershipArc.center - ownershipArc.span / 2 + t * ownershipArc.span + spin;
                });
            } else {
                angles = ringDots.map((_, i) => (i / ringCount) * Math.PI * 2 + spin);
            }

            if (stretchAxes.length > 0) {
                angles = angles.map(angle => {
                    let pushed = angle;
                    stretchAxes.forEach(axis => {
                        let diff = pushed - axis;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        if (Math.abs(diff) < cfg.stretchClearance) {
                            pushed += Math.sign(diff || 1) * (cfg.stretchClearance - Math.abs(diff));
                        }
                    });
                    return pushed;
                });
            }

            angles = this.spreadRingAngles(angles, footprints, captureRadius, cfg);
            angles = this.clampAnglesToOwnershipArc(angles, ownershipArc);

            const ringKey = this.getBlockRingKey(block);
            const prevCount = this.orbitRingCountByBlock.get(ringKey);
            if (prevCount !== ringCount) {
                ringDots.forEach(d => this.orbitAngleByNote.delete(d.noteIndex));
                this.orbitRingCountByBlock.set(ringKey, ringCount);
            }
            {
                const blend = activeBlocks.length === 1
                    ? (cfg.orbitAngleBlend ?? 0.16)
                    : (CONFIG.physics.crowdedBlock.orbitAngleBlend ?? cfg.orbitAngleBlend ?? 0.16);
                angles = angles.map((angle, i) => {
                    const noteIndex = ringDots[i].noteIndex;
                    const prev = this.orbitAngleByNote.get(noteIndex);
                    const next = prev === undefined ? angle : this.blendAngle(prev, angle, blend);
                    this.orbitAngleByNote.set(noteIndex, next);
                    return next;
                });
            }

            const clusterRelaxScale = (() => {
                let scale = activeBlocks.length === 1
                    ? cfg.singleBlockClusterRelaxScale
                    : cfg.singleBlockClusterRelaxScale * 1.6;
                const heavyTier = this.getHeavyWorkspaceTier(activeBlocks.length);
                if (heavyTier >= 0) {
                    scale *= [0.55, 0.42, 0.32][heavyTier];
                }
                return scale;
            })();

            const cluster = ringDots.map((d, i) => {
                const angle = angles[i];
                const peekExtend = this.outwardPeekExtension(block, angle, cfg);
                const targetR = captureRadius;
                const maxTargetR = captureRadius + peekExtend;
                return {
                    dot: d,
                    noteIndex: d.noteIndex,
                    footprint: footprints[i],
                    targetR: targetR,
                    maxTargetR: maxTargetR,
                    peekExtend: peekExtend,
                    x: block.bodyX + Math.cos(angle) * targetR,
                    y: block.bodyY + Math.sin(angle) * targetR
                };
            });

            this.relaxMoleculeCluster(cluster, block, cfg, clusterRelaxScale);

            cluster.forEach(m => {
                m.dot.overrideTarget = { x: m.x, y: m.y };
                const anchorList = noteAnchors.get(m.noteIndex);
                if (anchorList && anchorList[0]) {
                    anchorList[0].angle = Math.atan2(m.y - block.bodyY, m.x - block.bodyX);
                    anchorList[0].innerRadius = Math.hypot(m.x - block.bodyX, m.y - block.bodyY);
                }
            });
        });

        // Pass 3: siblings of single-anchor notes
        const siblingsByNote = new Map();
        bodiesData.forEach(d => {
            if (d.overrideTarget) return;
            const anchors = noteAnchors.get(d.noteIndex);
            if (!anchors || anchors.length !== 1) return;
            if (!siblingsByNote.has(d.noteIndex)) siblingsByNote.set(d.noteIndex, []);
            siblingsByNote.get(d.noteIndex).push(d);
        });

        siblingsByNote.forEach((siblings, noteIndex) => {
            const anchor = noteAnchors.get(noteIndex)[0];
            const match = anchor.dot;
            if (!match.overrideTarget) return;

            const block = anchor.block;
            const mx = match.overrideTarget.x - block.bodyX;
            const my = match.overrideTarget.y - block.bodyY;
            const anchorAngle = Math.atan2(my, mx);
            const anchorDist = Math.hypot(mx, my) || cfg.minRadius;

            siblings.forEach((s, k) => {
                const ring = 1 + Math.floor(k / cfg.siblingsPerRing);
                const idxInRing = k % cfg.siblingsPerRing;
                const side = idxInRing === 0 ? 0 :
                             Math.ceil(idxInRing / 2) * (idxInRing % 2 === 1 ? 1 : -1);

                const r = anchorDist + ring * cfg.ringSpacing;
                const a = anchorAngle + side * (cfg.groupArcSpacing / r);
                s.overrideTarget = {
                    x: block.bodyX + Math.cos(a) * r,
                    y: block.bodyY + Math.sin(a) * r
                };
            });
        });

        this.relaxCapturedMolecules(bodiesData, cfg);
        if (activeBlocks.length < 6) {
            this.relaxStretchedMolecules(bodiesData, cfg);
        } else if (activeBlocks.length >= 6) {
            this.relaxStretchedMolecules(bodiesData, cfg, 0.35);
        }
        this.enforceBlockClearance(bodiesData, cfg);
    }
});
