import {
  createVideoAdUnit,
  VastAdUnit,
  VastAdUnitOptions,
  VideoAdUnit,
  VideoAdUnitOptions,
  VpaidAdUnit,
  VpaidAdUnitOptions
} from '../../adUnit';
import {VideoAdContainer} from '../../adContainer';
import {getInteractiveFiles, getMediaFiles} from '../../vastSelectors';
import canPlay from '../../adUnit/helpers/media/canPlay';
import {start, closeLinear} from '../../tracker/linearEvents';
import {adStopped, adUserClose} from '../../adUnit/helpers/vpaid/api';
import {VastChain, ParsedAd} from '../../types';

const validate = (
  vastChain: VastChain,
  videoAdContainer: VideoAdContainer
): void => {
  if (!Array.isArray(vastChain) || vastChain.length === 0) {
    throw new TypeError('Invalid vastChain');
  }

  if (!(videoAdContainer instanceof VideoAdContainer)) {
    throw new TypeError('Invalid VideoAdContainer');
  }
};

const hasVpaidCreative = (ad: ParsedAd): boolean =>
  Boolean(getInteractiveFiles(ad));

const hasVastCreative = (
  ad: ParsedAd,
  videoElement: HTMLVideoElement
): boolean => {
  const mediaFiles = getMediaFiles(ad);

  if (mediaFiles) {
    return mediaFiles.some((mediaFile) => canPlay(videoElement, mediaFile));
  }

  return false;
};

interface StartAdUnitOptions<T extends VideoAdUnit> {
  /**
   * Will be called once the ad is ready with the ad unit.
   *
   * @param adUnit the ad unit instance.
   */
  onAdReady(adUnit: T): void;
}

const startAdUnit = <T extends VideoAdUnit, R extends VideoAdUnitOptions>(
  adUnit: T,
  {onAdReady}: StartAdUnitOptions<T> & R
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const createRejectHandler = (event: string) => () =>
      reject(new Error(`Ad unit start rejected due to event '${event}'`));

    adUnit.onError(reject);
    adUnit.on(start, () => resolve(adUnit));
    adUnit.on(adUserClose, createRejectHandler(adUserClose));
    adUnit.on(closeLinear, createRejectHandler(closeLinear));
    adUnit.on(adStopped, createRejectHandler(adStopped));

    onAdReady(adUnit);
    adUnit.start();
  });

const tryToStartVpaidAd = (
  vastChain: VastChain,
  videoAdContainer: VideoAdContainer,
  options: VpaidAdUnitOptions & StartAdUnitOptions<VpaidAdUnit>
): Promise<VpaidAdUnit> => {
  const inlineAd = vastChain[0].ad;

  if (!inlineAd || !hasVpaidCreative(inlineAd)) {
    throw new Error('No valid creative found in the passed VAST chain');
  }

  const adUnit = createVideoAdUnit(vastChain, videoAdContainer, {
    ...options,
    type: 'VPAID'
  });

  return startAdUnit<VpaidAdUnit, VpaidAdUnitOptions>(adUnit, options);
};

const startVastAd = (
  vastChain: VastChain,
  videoAdContainer: VideoAdContainer,
  options: VastAdUnitOptions & StartAdUnitOptions<VastAdUnit>
): Promise<VastAdUnit> => {
  const adUnit = createVideoAdUnit(vastChain, videoAdContainer, {
    ...options,
    type: 'VAST'
  });

  return startAdUnit(adUnit, options);
};

const startVideoAd = async (
  vastChain: VastChain,
  videoAdContainer: VideoAdContainer,
  options: StartVideoAdOptions
): Promise<VastAdUnit | VpaidAdUnit> => {
  validate(vastChain, videoAdContainer);
  try {
    return await tryToStartVpaidAd(vastChain, videoAdContainer, options);
  } catch (error) {
    const inlineAd = vastChain[0].ad;

    if (inlineAd && hasVastCreative(inlineAd, videoAdContainer.videoElement)) {
      return startVastAd(vastChain, videoAdContainer, options);
    }

    throw error;
  }
};

export type StartVideoAdOptions = VpaidAdUnitOptions &
  VastAdUnitOptions &
  StartAdUnitOptions<VastAdUnit | VpaidAdUnit>;

export default startVideoAd;
