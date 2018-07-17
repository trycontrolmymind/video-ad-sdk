/* eslint-disable promise/prefer-await-to-callbacks, class-methods-use-this, import/no-named-as-default-member */
import linearEvents from '../tracker/linearEvents';
import {
  acceptInvitation,
  creativeView,
  adCollapse,
  close
} from '../tracker/nonLinearEvents';
import {getClickThrough} from '../vastSelectors';
import Emitter from './helpers/Emitter';
import loadCreative from './helpers/vpaid/loadCreative';
import {
  adLoaded,
  adStarted,
  adPlaying,
  adPaused,
  startAd,
  stopAd,
  resumeAd,
  pauseAd,
  setAdVolume,
  getAdVolume,
  resizeAd,
  adSizeChange,
  adError,
  adVideoComplete,
  adSkipped,
  EVENTS,
  adVolumeChange,
  adImpression,
  adVideoStart,
  adVideoFirstQuartile,
  adVideoMidpoint,
  adVideoThirdQuartile,
  adUserAcceptInvitation,
  adUserMinimize,
  adUserClose,
  adClickThru,
  getAdIcons
} from './helpers/vpaid/api';
import retrieveIcons from './helpers/icons/retrieveIcons';
import addIcons from './helpers/icons/addIcons';
import waitFor from './helpers/vpaid/waitFor';
import callAndWait from './helpers/vpaid/callAndWait';
import handshake from './helpers/vpaid/handshake';
import initAd from './helpers/vpaid/initAd';
import safeCallback from './helpers/safeCallback';

const {
  complete,
  mute,
  unmute,
  skip,
  start,
  firstQuartile,
  pause,
  resume,
  impression,
  midpoint,
  thirdQuartile,
  clickThrough,
  iconClick,
  iconView,
  error: errorEvt
} = linearEvents;

const hidden = Symbol('hidden');

class VpaidAdUnit extends Emitter {
  [hidden] = {
    finish: () => {
      this[hidden].onFinishCallbacks.forEach((callback) => callback());
      this[hidden].finished = true;
    },
    finished: false,
    // eslint-disable-next-line complexity
    handleVpaidEvt: (event, payload) => {
      switch (event) {
      case adVideoComplete: {
        this[hidden].finish();
        this.emit(complete, complete, this);
        break;
      }
      case adError: {
        this.error = payload instanceof Error ? payload : new Error('VPAID general error');

        this.error.errorCode = 901;
        this.errorCode = 901;
        this[hidden].onErrorCallbacks.forEach((callback) => callback(this.error));
        this[hidden].finish();
        this.emit(errorEvt, errorEvt, this, this.error);
        break;
      }
      case adSkipped: {
        this.cancel();
        this.emit(skip, skip, this);
        break;
      }
      case adStarted: {
        this.emit(creativeView, creativeView, this);
        break;
      }
      case adImpression: {
        this.emit(impression, impression, this);
        break;
      }
      case adVideoStart: {
        this.emit(start, start, this);
        break;
      }
      case adVideoFirstQuartile: {
        this.emit(firstQuartile, firstQuartile, this);
        break;
      }
      case adVideoMidpoint: {
        this.emit(midpoint, midpoint, this);
        break;
      }
      case adVideoThirdQuartile: {
        this.emit(thirdQuartile, thirdQuartile, this);
        break;
      }
      case adUserAcceptInvitation: {
        this.emit(acceptInvitation, acceptInvitation, this);
        break;
      }
      case adUserMinimize: {
        this.emit(adCollapse, adCollapse, this);
        break;
      }
      case adUserClose: {
        this.emit(close, close, this);
        break;
      }
      case adPaused: {
        this.emit(pause, pause, this);
        break;
      }
      case adPlaying: {
        this.emit(resume, resume, this);
        break;
      }
      case adClickThru: {
        if (payload && payload.data) {
          const {
            url,
            playerHandles
          } = payload.data;

          if (playerHandles) {
            const clickThroughUrl = url ? url : getClickThrough(this.vastChain[0].ad);

            window.open(clickThroughUrl, '_blank');
          }
        }

        this.emit(clickThrough, clickThrough, this);
        break;
      }
      case adVolumeChange: {
        const volume = this.getVolume();

        if (volume === 0 && !this[hidden].muted) {
          this[hidden].muted = true;
          this.emit(mute, mute, this);
        }

        if (volume > 0 && this[hidden].muted) {
          this[hidden].muted = false;

          this.emit(unmute, unmute, this);
        }

        break;
      }
      }

      this.emit(event, event, this);
    },
    muted: false,
    onErrorCallbacks: [],
    onFinishCallbacks: [],
    started: false,
    throwIfFinished: () => {
      if (this.isFinished()) {
        throw new Error('VpaidAdUnit is finished');
      }
    },
    throwIfNotReady: () => {
      this[hidden].throwIfFinished();

      if (!this.isStarted()) {
        throw new Error('VpaidAdUnit has not started');
      }
    }
  };

  creativeAd = null;

  constructor (vastChain, videoAdContainer, {logger = console} = {}) {
    super(logger);

    this.vastChain = vastChain;
    this.videoAdContainer = videoAdContainer;
    this[hidden].loadCreativePromise = loadCreative(vastChain, videoAdContainer);
  }

  async start () {
    this[hidden].throwIfFinished();

    if (this.isStarted()) {
      throw new Error('VpaidAdUnit already started');
    }

    try {
      this.creativeAd = await this[hidden].loadCreativePromise;
      const adLoadedPromise = waitFor(this.creativeAd, adLoaded);

      for (const creativeEvt of EVENTS) {
        this.creativeAd.subscribe(this[hidden].handleVpaidEvt.bind(this, creativeEvt), creativeEvt);
      }

      const icons = this.creativeAd[getAdIcons] && this.creativeAd[getAdIcons]() && retrieveIcons(this.vastChain);

      if (icons) {
        this.icons = icons;

        const {
          drawIcons,
          hasPendingIconRedraws,
          removeIcons
        } = addIcons(this.icons, {
          logger: this.logger,
          onIconClick: (icon) => this.emit(iconClick, iconClick, this, icon),
          onIconView: (icon) => this.emit(iconView, iconView, this, icon),
          videoAdContainer: this.videoAdContainer
        });

        this.drawIcons = drawIcons;
        this.removeIcons = removeIcons;
        this.hasPendingIconRedraws = hasPendingIconRedraws;

        this[hidden].onFinishCallbacks.push(removeIcons);
      }

      handshake(this.creativeAd, '2.0');
      initAd(this.creativeAd, this.videoAdContainer, this.vastChain);

      await adLoadedPromise;

      // if the ad timed out while trying to load the videoAdContainer will be destroyed
      if (!this.videoAdContainer.isDestroyed()) {
        try {
          await callAndWait(this.creativeAd, startAd, adStarted);

          if (this.icons) {
            const drawIcons = async () => {
              if (this.isFinished()) {
                return;
              }

              await this.drawIcons();

              if (this.hasPendingIconRedraws() && !this.isFinished()) {
                setTimeout(drawIcons, 500);
              }
            };

            await drawIcons();
          }

          this[hidden].started = true;
        } catch (error) {
          this.cancel();
        }
      }

      return this;
    } catch (error) {
      this[hidden].handleVpaidEvt(adError, error);
      throw error;
    }
  }

  resume () {
    this[hidden].throwIfNotReady();

    return callAndWait(this.creativeAd, resumeAd, adPlaying);
  }

  pause () {
    this[hidden].throwIfNotReady();

    return callAndWait(this.creativeAd, pauseAd, adPaused);
  }

  setVolume (volume) {
    this[hidden].throwIfNotReady();

    return this.creativeAd[setAdVolume](volume);
  }

  getVolume () {
    this[hidden].throwIfNotReady();

    return this.creativeAd[getAdVolume]();
  }

  cancel () {
    this[hidden].throwIfFinished();

    this.creativeAd[stopAd]();

    this[hidden].finish();
  }

  onFinish (callback) {
    this[hidden].throwIfFinished();

    if (typeof callback !== 'function') {
      throw new TypeError('Expected a callback function');
    }

    this[hidden].onFinishCallbacks.push(safeCallback(callback, this.logger));
  }

  onError (callback) {
    this[hidden].throwIfFinished();

    if (typeof callback !== 'function') {
      throw new TypeError('Expected a callback function');
    }

    this[hidden].onErrorCallbacks.push(safeCallback(callback, this.logger));
  }

  isFinished () {
    return this[hidden].finished;
  }

  isStarted () {
    return this[hidden].started;
  }

  async resize () {
    this[hidden].throwIfNotReady();

    if (this.icons) {
      await this.removeIcons();
      await this.drawIcons();
    }

    return callAndWait(this.creativeAd, resizeAd, adSizeChange);
  }
}

export default VpaidAdUnit;
