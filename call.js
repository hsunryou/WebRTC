function loadPage() {
    console.log('on loadPage');

    $("#loginText").val(localStorage.getItem("login"));
    $("#passwordText").val(localStorage.getItem("pwd"));
    $("#callNumberText").val(localStorage.getItem("callNumber"));

    this._soundsControl = document.getElementById("sounds");
}

function login() {
    console.log("on login");
    this.loginText = $("#loginText");
    this.passwordText = $("#passwordText");
    this.loginButton = $("#loginButton");
    this.logOutButton = $("#logOutButton");
    this.callButton = $('#callNumberButton');
    this.hangUpButton = $('#hangUpButton');

    localStorage.setItem("login", this.loginText.val());
    localStorage.setItem("pwd", this.passwordText.val());

    socket = new JsSIP.WebSocketInterface("wss://ippbx.mediacall.co.kr:8089/ws");
    _ua = new JsSIP.UA(
        {
            uri: "sip:" + this.loginText.val() + "@ippbx.mediacall.co.kr",
            password: this.passwordText.val(),
            display_name: this.loginText.val(),
            sockets: [socket]
        });

    // connect to aster
    this._ua.on('connecting', () => {
        console.log("UA connecting");
    });

    // connected to aster
    this._ua.on('connected', () => {
        console.log("UA connected");
    });

    // aster registered us, now you can make and receive calls
    this._ua.on('registered', () => {
        console.log("UA registered");

        this.loginButton.addClass('d-none');
        this.logOutButton.removeClass('d-none');
        this.loginText.prop('disabled', true);
        this.passwordText.prop('disabled', true);

        $("#callPanel").removeClass('d-none');
    });

    // master doesn't know about us anymore
    this._ua.on('unregistered', () => {
        console.log("UA unregistered");
    });

    // aster did not log us in, something is wrong, most likely an incorrect username or password
    this._ua.on('registrationFailed', (data) => {
        console.error("UA registrationFailed", data.cause);
    });

    // I'm seducing a charming woman
    this._ua.start();
}

function logout() {
    console.log("on logout")

    this.loginButton.removeClass('d-none');
    this.logOutButton.addClass('d-none');
    this.loginText.prop('disabled', false);
    this.passwordText.prop('disabled', false);

    $("#callPanel").addClass('d-none');

    // close everything nafig, log out of the aster, close the connection
    this._ua.stop();
}


function call() {
    let number = $('#callNumberText').val();
    localStorage.setItem("callNumber", number);

    this.callButton.addClass('d-none');
    this.hangUpButton.removeClass('d-none');

    // Make an OUTGOING call
    // This code can't receive calls!
    this.session = this._ua.call(number, {
        pcConfig: {
            hackStripTcp: true, // It's important for chrome not to be stupid when calling
            rtcpMuxPolicy: 'negotiate', // Important for chrome to make multiplexing work. This thing must be enabled on the aster.
            iceServers: []
        },
        mediaConstraints: {
            audio: true, // Only support audio
            video: false
        },
        rtcOfferConstraints: {
            offerToReceiveAudio: 1, // Only accept audio
            offerToReceiveVideo: 0
        }
    });

    // This is needed for an incoming call, until we use
    this._ua.on('newRTCSession', (data) => {
        if (!this._mounted)
            return;

        if (data.originator === 'local')
            return;

        // audioPlayer.play('ringing');
    });

    // Aster connected us to the subscriber
    this.session.on('connecting', () => {
        console.log("UA session connecting");
        playSound("ringback.ogg", true);

        // Here we connect to the microphone and hook the stream to it, which will go to the aster
        let peerconnection = this.session.connection;
        let localStream = peerconnection.getLocalStreams()[0];

        // Handle local stream
        if (localStream) {
            // Clone local stream
            this._localClonedStream = localStream.clone();

            console.log('UA set local stream');

            let localAudioControl = document.getElementById("localAudio");
            localAudioControl.srcObject = this._localClonedStream;
        }

        // As soon as the aster gives us the subscriber's stream, we put it in our headphones
        peerconnection.addEventListener('addstream', (event) => {
            console.log("UA session addstream");

            let remoteAudioControl = document.getElementById("remoteAudio");
            remoteAudioControl.srcObject = event.stream;
        });
    });

    // In the process of dialing
    this.session.on('progress', () => {
        console.log("UA session progress");
        playSound("ringback.ogg", true);
    });

    // Dialing failed, for example, the subscriber dropped the call
    this.session.on('failed', (data) => {
        console.log("UA session failed");
        stopSound("ringback.ogg");
        playSound("rejected.mp3", false);

        this.callButton.removeClass('d-none');
        this.hangUpButton.addClass('d-none');
    });

    // We talked, ran away
    this.session.on('ended', () => {
        console.log("UA session ended");
        playSound("rejected.mp3", false);
        JsSIP.Utils.closeMediaStream(this._localClonedStream);

        this.callButton.removeClass('d-none');
        this.hangUpButton.addClass('d-none');
    });

    // Call accepted, mono start talking
    this.session.on('accepted', () => {
        console.log("UA session accepted");
        stopSound("ringback.ogg");
        playSound("answered.mp3", false);
    });
}

function hangUp() {
    this.session.terminate();
    JsSIP.Utils.closeMediaStream(this._localClonedStream);
}

function playSound(soundName, loop) {
    this._soundsControl.pause();
    this._soundsControl.currentTime = 0.0;
    this._soundsControl.src = "sounds/" + soundName
    this._soundsControl.loop = loop;
    this._soundsControl.play();
}

function stopSound() {
    this._soundsControl.pause();
    this._soundsControl.currentTime = 0.0;
}