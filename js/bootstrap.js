document.addEventListener('DOMContentLoaded', () => {
    applyVisualScaleTokens();
    applySiteGridTokens();

    try {
        DepthController.init();
    } catch (err) {
        console.error('DepthController.init failed:', err);
    }

    SilhouetteEngine.init();
    SpatialNavigation.init();
    ArtifactInspector.init();
    ActionWarehouse.init();
    applySiteGridTokens();

    try {
        PhysicsEngine.init();
    } catch (err) {
        console.error('PhysicsEngine.init failed:', err);
    }

    IdleRefresh.init();

    const safetyMs = CONFIG.boot.safetyRevealMs ?? 5000;
    const safetyTimer = setTimeout(() => {
        console.warn('Boot safety reveal — data pipeline did not finish in time');
        AppState.revealApp();
    }, safetyMs);

    AppState.init()
        .then(() => AppState.finishBoot())
        .catch((err) => {
            console.error('AppState.init failed:', err);
            AppState.revealApp();
        })
        .finally(() => clearTimeout(safetyTimer));
});
