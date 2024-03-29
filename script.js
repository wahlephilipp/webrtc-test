(async () => {
  //const videoGrid = document.getElementById('video-grid');

  let negotiator = 0;

  const peerConnectionsMap = new Map();

  const peerConnectionsVideosMap = new Map();

  let localVideoStream = null;

  let peerConnectionOffered = null;

  // get user media
  const CONSTRAINTS = {
    video: true,
    audio: false,
  };

  const RTC_STATES = {
    CONNECTED: 'connected',
    CONNECTING: 'connecting',
    DISCONNECTED: 'disconnected',
    FAILED: 'failed',
  };

  const PEER_CONFIG = {
    // iceServers: [
    //  { urls: 'stun:stun.services.mozilla.com' },
    //  { urls: 'stun:stun.l.google.com:19302' },
    // ],
  };

  // -------- api calls ---------
  const findAnswer = async () => {
    try {
      const response = await fetch(
        `http://localhost:3030/answers?requester=${negotiator}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }
      );
      let answer = await response.json();
      if (response.status === 200) {
        return answer.length > 0 ? answer[0] : null;
      }
    } catch (err) {
      console.error(err);
    }
  };

  const findOffers = async () => {
    try {
      const response = await fetch(
        `http://localhost:3030/offers?requester=${negotiator}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }
      );
      return await response.json();
    } catch (err) {
      console.error(err);
    }
  };

  const sendAnswer = async (offer, answer) => {
    try {
      await fetch(`http://localhost:3030/negotiations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negotiator: offer.negotiator,
          offer: offer.offer,
          answer: answer.sdp,
        }),
      });
    } catch (error) {
      this.displayError(error);
    }
  };

  const sendOffer = async (offer) => {
    try {
      await fetch(`http://localhost:3030/negotiations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negotiator,
          offer: offer.sdp,
          answer: null,
        }),
      });
    } catch (error) {
      this.displayError(error);
    }
  };

  // -------- /api calls ---------

  // -------- utils ----------
  const sleep = (delay = 2000) => {
    return new Promise((resolve) => setTimeout(resolve, delay));
  };
  /**
   *
   * @param {*} connection
   * @param {*} offering
   */
  const negotiateLocalDescription = (connection, offering) => {
    return new Promise((resolve) => {
      console.log('search for ice candidate');
      connection.onicecandidate = (event) => {
        console.log('found ice candidate!');
        if (!event.candidate) {
          delete connection.onicecandidate;
          resolve(connection.localDescription);
        }
      };
      let promise = offering
        ? connection.createOffer()
        : connection.createAnswer();
      promise.then((sessionDescription) =>
        connection.setLocalDescription(sessionDescription)
      );
    });
  };

  // --------- /utils --------------

  // --------- webrtc ---------------

  const handlePeerConnection = async () => {
    try {
      if (peerConnectionOffered.connectionState !== RTC_STATES.CONNECTED) {
        const negotiation = await findAnswer();
        if (!!negotiation) {
          // Set answer to establish connection

          await peerConnectionOffered.setRemoteDescription({
            type: 'answer',
            sdp: negotiation.answer,
          });

          // should be the player position
          peerConnectionsMap.set(negotiation.negotiator, peerConnectionOffered);

          // Create new peer connection with new offer
          peerConnectionOffered = await createPeerOffer();
        }

        // todo cleanup
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleIncommingOffers = async () => {
    const offers = await findOffers();

    console.log(offers);

    for (const offer of offers) {
      const pc = await createPeerAnswer(offer);

      peerConnectionsMap.set(offer.negotiator, pc);
    }
  };

  const initPeer = (position) => {
    const pc = new RTCPeerConnection(PEER_CONFIG);

    pc.onaddstream = (obj) => {
      if (position == undefined) return;
      const peerVideoElement = document.querySelector(
        `[data-position="${position}"]`
      );
      peerVideoElement.autoplay = true;
      peerVideoElement.srcObject = obj.stream;

      /*
      let vid = document.createElement('video');
      vid.autoplay = true;
      videoGrid.appendChild(vid);
      vid.srcObject = obj.stream;
      */
    };

    pc.addStream(localVideoStream);

    pc.onconnectionstatechange = (e) =>
      console.log('onconnectionstatechange', pc.connectionState);

    return pc;
  };

  const createPeerOffer = async () => {
    const pc = initPeer();

    const offer = await negotiateLocalDescription(pc, true);
    await sendOffer(offer);

    return pc;
  };

  const createPeerAnswer = async (offer) => {
    // requester position
    const pc = initPeer(offer.negotiator);

    await pc.setRemoteDescription({ type: 'offer', sdp: offer.offer });
    const answer = await negotiateLocalDescription(pc, false);
    await sendAnswer(offer, answer);

    return pc;
  };

  const gameLoop = async () => {
    while (true) {
      await handlePeerConnection();

      await sleep(1000);
    }
  };

  const init = async () => {
    negotiator = +document.getElementById('user-value').value;

    localVideoStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });

    // add local video
    const localVideoElement = document.querySelector(
      `[data-position="${negotiator}"]`
    );
    localVideoElement.srcObject = localVideoStream;

    await handleIncommingOffers();

    peerConnectionOffered = await createPeerOffer();

    gameLoop();
  };

  // buttons
  document.querySelector('[name=btn-join]').addEventListener('click', init);
})();
