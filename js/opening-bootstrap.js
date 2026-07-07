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

    const opening = OpeningScreen.initEarly();
    if (opening.skipped) {
        window.location.replace(OpeningScreen.cfg().entryTarget || 'experience.html');
        return;
    }

    OpeningScreen.mount();

    OpeningData.init()
        .then(() => {
            OpeningScreen.onDataReady();
        })
        .catch((err) => {
            console.error('Opening data pipeline failed:', err);
            OpeningScreen.onDataReady();
        });
});
