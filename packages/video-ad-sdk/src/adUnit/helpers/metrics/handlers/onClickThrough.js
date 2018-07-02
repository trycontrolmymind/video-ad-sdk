/* eslint-disable callback-return, promise/prefer-await-to-callbacks */
import {linearEvents} from '../../../../tracker';

const {clickThrough} = linearEvents;

const onClickThrough = ({videoElement, context, element}, callback, {clickThroughUrl} = {}) => {
  const {document} = context;
  const placeholder = element || videoElement.parentNode;
  const anchor = document.createElement('A');

  anchor.classList.add('mol-vast-clickthrough');
  anchor.style.width = '100%';
  anchor.style.height = '100%';
  anchor.style.position = 'absolute';
  anchor.style.left = 0;
  anchor.style.top = 0;

  if (clickThroughUrl) {
    anchor.href = clickThroughUrl;
    anchor.target = '_blank';
  }

  anchor.onclick = (event) => {
    if (Event.prototype.stopPropagation !== undefined) {
      event.stopPropagation();
    }

    if (videoElement.paused) {
      videoElement.play();
    } else {
      videoElement.pause();

      callback(clickThrough);
    }
  };

  placeholder.insertBefore(anchor, placeholder.nextSibling);

  return () => {
    placeholder.removeChild(anchor);
  };
};

export default onClickThrough;

