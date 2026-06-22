document.addEventListener('DOMContentLoaded', () => {
    applyVisualScaleTokens();
    AppState.init();
    DepthController.init();
    SilhouetteEngine.init();
    SpatialNavigation.init();
    ArtifactInspector.init();
    ActionWarehouse.init();
    PhysicsEngine.init();
    IdleRefresh.init();
});
