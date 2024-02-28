/**
 * Copyright (c) [2015-2019] SUSE Linux
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE.txt file for details.
 */

const DEFAULT_INTERVAL = 65;
const DEFAULT_THRESHOLD = -50;

// TODO: study whether is possible to replace this code with a Janus based version.

/**
 * Builds a speak observer object
 *
 * @param {Object} options
 * @property {Integer} options.interval Time between status checks
 * @property {Integer} options.threshold Threshold value to consider that the stream is speaking
 * @property {Function} options.start Function to run when the observer starts
 * @property {Function} options.stop Function to run when the observer stops
 */
export const createSpeakObserver = (stream, options) => {
  options = options || {};
  let that = {};

  let interval = options.interval || DEFAULT_INTERVAL;
  let threshold = options.threshold || DEFAULT_THRESHOLD;

  let AudioContextType = window.AudioContext || window.webkitAudioContext;
  let audioContext = new AudioContextType();
  // Setup an analyser
  let analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.1;
  let fftBins = new window.Float32Array(analyser.fftSize);
  // Setup a source node and connect it to the analyser
  let sourceNode = audioContext.createMediaStreamSource(stream);
  sourceNode.connect(analyser);

  let speaking = false;
  let loop = null;
  let history = new Array(10).fill(0);

  that.start = function() {
    loop = window.setInterval(function() {
      // No clue why, but in some situations (which seems to be different in
      // every browser) audioContext is suspended.
      //
      // For that reason, using a ScriptProcessor is unreliable and we have to
      // use setTimeout, including this code to manually wake up the context
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      } else {
        poll();
      }
    }, interval);
  };

  that.destroy = function() {
    window.clearInterval(loop);
  };

  that.isSpeaking = function() {
    return speaking;
  };

  function poll() {
    let audioDetected = isAudioDetected();
    let sum;

    if (audioDetected && !speaking) {
      // Make sure we have been above the threshold in, at least, 2 of the 3
      // previous iterations
      sum = history.slice(history.length - 3).reduce((s, i) => s + i, 0);
      if (sum >= 2) {
        speaking = true;
        if (options.start) {
          options.start();
        }
      }
    } else if (!audioDetected && speaking) {
      // Make sure we have been below the threshold for the whole history
      // (i.e. 10 iterations)
      sum = history.reduce((s, i) => s + i, 0);
      if (sum === 0) {
        speaking = false;
        if (options.stop) {
          options.stop();
        }
      }
    }
    history.shift();
    history.push(0 + audioDetected);
  }

  function isAudioDetected() {
    analyser.getFloatFrequencyData(fftBins);
    // Skip the first 4... simply because hark does it
    // (too low frequencies to be voice, I guess)
    for (let i = 4, ii = fftBins.length; i < ii; i++) {
      if (fftBins[i] > threshold && fftBins[i] < 0) {
        return true;
      }
    }
    return false;
  }

  return that;
};
