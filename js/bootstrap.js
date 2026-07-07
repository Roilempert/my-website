document.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof applyPresentationProfile === 'function') applyPresentationProfile();
    } catch (err) {
        console.error('Presentation profile failed:', err);
    }

    try {
        applyVisualScaleTokens();
        applySiteGridTokens();
    } catch (err) {
        console.error('Site token init failed:', err);
    }

    try {
        if (typeof SiteAbout !== 'undefined') SiteAbout.init();
    } catch (err) {
        console.error('SiteAbout.init failed:', err);
    }

    try {
        if (typeof OpeningBackground !== 'undefined') {
            OpeningBackground.mountSiteBackground();
        }
    } catch (err) {
        console.error('Site background init failed:', err);
    }

    try {
        if (typeof NoteCensor !== 'undefined') NoteCensor.init();
    } catch (err) {
        console.error('NoteCensor.init failed:', err);
    }

    try {
        DepthController.init();
    } catch (err) {
        console.error('DepthController.init failed:', err);
    }

    try {
        MesoSilhouetteCache.init();
    } catch (err) {
        console.error('MesoSilhouetteCache.init failed:', err);
    }

    SilhouetteEngine.init();
    SpatialNavigation.init();
    ArtifactInspector.init();
    ActionWarehouse.init();

    try {
        PhysicsEngine.init();
    } catch (err) {
        console.error('PhysicsEngine.init failed:', err);
    }

    try {
        NavigationMap.init();
    } catch (err) {
        console.error('NavigationMap.init failed:', err);
    }

    try {
        applySiteGridTokens();
    } catch (err) {
        console.error('Site grid refresh failed:', err);
    }

    IdleRefresh.init();

    try {
        if (typeof ShowReel !== 'undefined') {
            ShowReel.init({ page: 'experience' });
        }
    } catch (err) {
        console.error('ShowReel.init failed:', err);
    }

    const safetyMs = CONFIG.boot.safetyRevealMs ?? 5000;
    const safetyTimer = setTimeout(() => {
        console.warn('Boot safety reveal — data pipeline did not finish in time');
        if (typeof AppState.prepareBoot === 'function') AppState.prepareBoot();
        AppState.revealApp();
        try {
            if (typeof NavigationMap !== 'undefined') {
                NavigationMap.onBootComplete();
            }
        } catch (err) {
            console.warn('NavigationMap.onBootComplete failed:', err);
        }
    }, safetyMs);

    AppState.init()
        .then(() => AppState.finishBoot())
        .catch((err) => {
            console.error('AppState.init failed:', err);
            AppState.revealApp();
            try {
                if (typeof NavigationMap !== 'undefined') {
                    NavigationMap.onBootComplete();
                }
            } catch (mapErr) {
                console.warn('NavigationMap.onBootComplete failed:', mapErr);
            }
        })
        .finally(() => clearTimeout(safetyTimer));
});
