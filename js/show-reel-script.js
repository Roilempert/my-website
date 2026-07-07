/* ==========================================================================
   Show Reel — scripted demo sequences
   ========================================================================== */
const ShowReelScripts = {
    default(ctx) {
        const vw = () => window.innerWidth;
        const vh = () => window.innerHeight;

        return [
            {
                id: 'reset',
                run: async () => {
                    ctx.resetBoard();
                    await ctx.delay(400);
                    await ctx.goToL1();
                    await ctx.centerCanvas();
                }
            },
            {
                id: 'roam-1',
                cursor: () => ({ x: vw() * 0.62, y: vh() * 0.42 }),
                run: async () => {
                    await ctx.scrollTo(320, 140, 4000);
                }
            },
            {
                id: 'roam-2',
                cursor: () => ({ x: vw() * 0.38, y: vh() * 0.48 }),
                run: async () => {
                    await ctx.scrollTo(-260, 90, 4000);
                }
            },
            {
                id: 'roam-3',
                cursor: () => ({ x: vw() * 0.55, y: vh() * 0.36 }),
                run: async () => {
                    await ctx.scrollTo(180, -110, 4000);
                }
            },
            {
                id: 'warehouse',
                cursor: () => {
                    const launcher = document.querySelector('.warehouse-launcher');
                    if (launcher) {
                        const r = launcher.getBoundingClientRect();
                        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                    }
                    return { x: vw() * 0.92, y: vh() * 0.92 };
                },
                run: async () => {
                    ctx.openWarehouse();
                    await ctx.delay(1200);
                    ctx.closeWarehouse();
                    await ctx.delay(600);
                }
            },
            {
                id: 'capture',
                cursor: () => ({ x: vw() * 0.5, y: vh() * 0.38 }),
                run: async () => {
                    const block = ctx.pickTagBlock();
                    if (!block) return;
                    const { width, height } = ActionWarehouse.blockMetrics(block);
                    const pageX = window.pageXOffset + vw() * 0.5 - width / 2;
                    const pageY = window.pageYOffset + vh() * 0.38 - height / 2;
                    ctx.placeBlock(block, pageX, pageY);
                    await ctx.waitCaptureSettle(5500);
                }
            },
            {
                id: 'l2-peek',
                cursor: () => ({ x: vw() * 0.5, y: vh() * 0.45 }),
                run: async () => {
                    await ctx.goToL2();
                    await ctx.delay(800);
                    await ctx.scrollTo(0, 220, 2800);
                    await ctx.delay(600);
                    await ctx.goToL1();
                    await ctx.centerCanvas();
                }
            }
        ];
    }
};
