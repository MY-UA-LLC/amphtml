import {createElementWithAttributes, iterateCursor} from '#core/dom';
import {map} from '#core/types/object';

import {getExperimentBranch} from '#experiments';
import {StoryAdSegmentExp} from '#experiments/story-ad-progress-segment';

import {dev, user} from '#utils/log';

import {CSS as attributionCSS} from '../../../build/amp-story-auto-ads-attribution-0.1.css';
import {CSS as ctaButtonCSS} from '../../../build/amp-story-auto-ads-cta-button-0.1.css';
import {openWindowDialog} from '../../../src/open-window-dialog';
import {assertHttpsUrl} from '../../../src/url';
import {createShadowRootWithStyle} from '../../amp-story/1.0/utils';

/**
 * @typedef {{
 *  cta-type: ?string,
 *  cta-url: ?string,
 *  cta-landing-page-type: ?string,
 *  attribution-icon: ?string,
 *  attribution-url: ?string,
 * }}
 */
export let StoryAdUIMetadata;

/** @const {string} */
const TAG = 'amp-story-auto-ads:ui';

/** @const {string} */
const CTA_META_PREFIX = 'amp-cta-';

/** @const {string} */
const A4A_VARS_META_PREFIX = 'amp4ads-vars-';

export const START_CTA_ANIMATION_ATTR = 'cta-active';

/** @enum {string} */
export const A4AVarNames = {
  ATTRIBUTION_ICON: 'attribution-icon',
  ATTRIBUTION_URL: 'attribution-url',
  CTA_TYPE: 'cta-type',
  CTA_URL: 'cta-url',
};

/** @type {Array<string>} */
const PageOutlinkLayerVarNames = [
  'cta-accent-color',
  'cta-accent-element',
  'cta-image',
  'theme',
];

/** @enum {string} */
const DataAttrs = {
  CTA_TYPE: 'data-vars-ctatype',
  CTA_URL: 'data-vars-ctaurl',
};

/**
 * Finds all meta tags starting with `amp4ads-vars-` or `amp-cta`.
 * @param {Document} doc
 * @return {!IArrayLike}
 */
export function getStoryAdMetaTags(doc) {
  const selector = 'meta[name^=amp4ads-vars-],meta[name^=amp-cta-]';
  return doc.querySelectorAll(selector);
}

/**
 * Creates object containing information extracted from the creative
 * that is needed to render story ad ui e.g. cta, attribution, etc.
 * @param {!Document} doc
 * @return {StoryAdUIMetadata}
 */
export function getStoryAdMetadataFromDoc(doc) {
  const storyMetaTags = getStoryAdMetaTags(doc);
  const vars = map();
  iterateCursor(storyMetaTags, (tag) => {
    const {content, name} = tag;
    if (name.startsWith(CTA_META_PREFIX)) {
      const key = name.split('amp-')[1];
      vars[key] = content;
    } else if (name.startsWith(A4A_VARS_META_PREFIX)) {
      const key = name.split(A4A_VARS_META_PREFIX)[1];
      vars[key] = content;
    }
  });
  return vars;
}

/**
 * Gets story ad UI metadata from the <amp-ad> element.
 * @param {!Element} adElement
 * @return {!Object}
 */
export function getStoryAdMetadataFromElement(adElement) {
  const ctaUrl = adElement.getAttribute(DataAttrs.CTA_URL);
  const ctaType = adElement.getAttribute(DataAttrs.CTA_TYPE);
  return {
    [A4AVarNames.CTA_TYPE]: ctaType,
    [A4AVarNames.CTA_URL]: ctaUrl,
  };
}

/**
 * Returns a boolean indicating if there is sufficent metadata to render CTA.
 * @param {!StoryAdUIMetadata} metadata
 * @param {boolean=} opt_inabox
 * @return {boolean}
 */
export function validateCtaMetadata(metadata, opt_inabox) {
  // If making a CTA layer we need a button name & outlink url.
  if (!metadata[A4AVarNames.CTA_TYPE] || !metadata[A4AVarNames.CTA_URL]) {
    // Don't polute inabox logs, as we don't know when this is intended to
    // be a story ad.
    !opt_inabox &&
      user().error(TAG, 'Both CTA Type & CTA Url are required in ad response.');
    return false;
  }
  return true;
}

/**
 * Creates ad attribution UI if sufficent metadata. Returns element if
 * successfully created.
 * @param {!Window} win
 * @param {!StoryAdUIMetadata} metadata
 * @param {!Element} container
 * @return {?Element}
 */
export function maybeCreateAttribution(win, metadata, container) {
  const doc = win.document;

  try {
    const href = metadata[A4AVarNames.ATTRIBUTION_URL];
    const src = metadata[A4AVarNames.ATTRIBUTION_ICON];

    // Ad attribution is optional, but need both to render.
    if (!href || !src) {
      return null;
    }

    assertHttpsUrl(
      href,
      dev().assertElement(container),
      'amp-story-auto-ads attribution url'
    );

    assertHttpsUrl(
      src,
      dev().assertElement(container),
      'amp-story-auto-ads attribution icon'
    );

    const root = createElementWithAttributes(doc, 'div', {
      'role': 'button',
      'class': 'i-amphtml-attribution-host',
    });

    const adChoicesIcon = createElementWithAttributes(doc, 'img', {
      'class': 'i-amphtml-story-ad-attribution',
      'src': src,
    });

    adChoicesIcon.addEventListener('click', (unusedEvent) =>
      handleAttributionClick(win, href)
    );

    createShadowRootWithStyle(root, adChoicesIcon, attributionCSS);
    container.appendChild(root);

    return adChoicesIcon;
  } catch (e) {
    // If something goes wrong creating the attribution, we still want to
    // show the ad.
    return null;
  }
}

/**
 * Opens attribution click in new window.
 * @param {!Window} win
 * @param {string} href
 */
export function handleAttributionClick(win, href) {
  openWindowDialog(win, href, '_blank');
}

/**
 * Creates a page-outlink element, returns an anchor tag containing relevant data if successful.
 * @param {!Document} doc
 * @param {!StoryAdUIMetadata} uiMetadata
 * @param {!Element} container
 * @return {?Element}
 */
function createPageOutlink_(doc, uiMetadata, container) {
  const pageOutlink = doc.createElement('amp-story-page-outlink');
  pageOutlink.setAttribute('layout', 'nodisplay');

  const pageAnchorTag = createElementWithAttributes(doc, 'a', {
    'class': 'i-amphtml-story-ad-link',
    'target': '_top',
    'href': uiMetadata[A4AVarNames.CTA_URL],
  });
  pageAnchorTag.textContent = uiMetadata[A4AVarNames.CTA_TYPE];

  pageOutlink.appendChild(pageAnchorTag);

  for (const pageOutlinkLayerVarName of PageOutlinkLayerVarNames) {
    if (uiMetadata[pageOutlinkLayerVarName]) {
      pageOutlink.setAttribute(
        pageOutlinkLayerVarName,
        uiMetadata[pageOutlinkLayerVarName]
      );
    }
  }

  pageOutlink.className = 'i-amphtml-story-page-outlink-container';

  container.appendChild(pageOutlink);
  return pageAnchorTag;
}

/**
 * Creates a CTA layer, returns an anchor tag containing relevant data if successful.
 * @param {!Element} a
 * @param {!Document} doc
 * @param {!Element} container
 * @return {?Element}
 */
function createCtaLayer_(a, doc, container) {
  const ctaLayer = doc.createElement('amp-story-cta-layer');
  ctaLayer.className = 'i-amphtml-cta-container';

  const linkRoot = createElementWithAttributes(doc, 'div', {
    'class': 'i-amphtml-story-ad-link-root',
    'role': 'button',
  });

  createShadowRootWithStyle(linkRoot, a, ctaButtonCSS);

  ctaLayer.appendChild(linkRoot);
  container.appendChild(ctaLayer);
  return a;
}

/**
 * @param {!Document} doc
 * @param {!./story-ad-button-text-fitter.ButtonTextFitter} buttonFitter
 * @param {!Element} container
 * @param {!StoryAdUIMetadata} uiMetadata
 * @return {!Promise<?Element>} If anchor was successfully created.
 */
export function createCta(doc, buttonFitter, container, uiMetadata) {
  const ctaUrl = uiMetadata[A4AVarNames.CTA_URL];
  const ctaText = uiMetadata[A4AVarNames.CTA_TYPE];

  // TODO(#36035): we should be using this element in createPageOutlink_
  // instead of creating it and dropping.
  const a = createElementWithAttributes(doc, 'a', {
    'class': 'i-amphtml-story-ad-link',
    'target': '_blank',
    'href': ctaUrl,
  });

  const fitPromise = buttonFitter.fit(
    dev().assertElement(container),
    a, // Container
    ctaText // Content
  );

  return fitPromise.then((success) => {
    if (!success) {
      user().warn(TAG, 'CTA button text is too long. Ad was discarded.');
      return null;
    }

    a.href = ctaUrl;
    a.textContent = ctaText;

    if (a.protocol !== 'https:' && a.protocol !== 'http:') {
      user().warn(TAG, 'CTA url is not valid. Ad was discarded');
      return null;
    }

    const storyAdSegmentBranch = getExperimentBranch(
      doc.defaultView,
      StoryAdSegmentExp.ID
    );

    if (
      storyAdSegmentBranch &&
      storyAdSegmentBranch !== StoryAdSegmentExp.CONTROL
    ) {
      return createPageOutlink_(doc, uiMetadata, container);
    } else {
      return createCtaLayer_(a, doc, container);
    }
  });
}
