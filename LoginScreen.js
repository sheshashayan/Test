import React from "react";
import {
  Alert,
  Animated,
  AsyncStorage,
  Image,
  ImageBackground,
  Keyboard,
  NetInfo,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View
} from "react-native";
import { connect } from "react-redux";
import { Ionicons } from "@expo/vector-icons";
import { Linking } from "expo";
import * as LocalAuthentication from "expo-local-authentication";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import Sentry from "sentry-expo";
import I18n from "ex-react-native-i18n";

import backendPostAsync from "../api/backendPostAsync";
import backendGetAsync from "../api/backendGetAsync";
import backendPanelLogin from "../api/backendPanelLogin";
import backendPanelStatus from "../api/backendPanelStatus";
import backendPanelSync from "../api/backendPanelSync";
import getPushTokensAsync from "../api/getPushTokensAsync";
import { AppModal } from "../components/AppModal";
import { ProgressModal } from "../components/ProgressModal";
import Actions from "../state/Actions";
import commonStyles from "../styles/CommonStyles";
import StyleSizes from "../styles/StyleSizes";
import Colors from "../constants/Colors";
import Layout from "../constants/Layout";
import {
  secureStoreUsername,
  secureStorePassword,
  secureStoreServer,
  secureStoreLastPin
} from "../constants/StorageKeys";
import { userSettingsPrefix } from "../constants/StorageKeys";
import { imageWithName } from "../lib/ImageWithName";
import { supportsFaceID } from "../lib/supportsFaceID";
import { validatePanelUserCode } from "../lib/validation";
import {
  codeStorageEnabled,
  codeStorageLastPinDelete,
  codeStorageLastPinGet,
  codeStorageLastPinSet
} from "../lib/storedCodes";
import { navReset } from "../lib/navReset";
import {
  ThemeFolder,
  ThemeImage,
  ThemeInitialiseCache
} from "../components/Theme";
import { AppText, AppTitle, AppUnTextInput } from "../components/StyledText";
import { AppView } from "../components/AppFramework";
import { analyticsInit, analyticsLogEvent } from "../api/Analytics";

// Use a short timeout for logging in
const LOGIN_TIMEOUT_MS = 15 * 1000;

// Logo and fingerprint image sizes
const PRINT_SIZE = Layout.window.height * 0.085;
const logoScaleSmallest = 0.1;
const logoScaleLargest = 1.0;

// Work around NetInfo isConnected() not working
// https://github.com/facebook/react-native/issues/8615#issuecomment-417134578
const onInitialNetConnection = isConnected => {
  console.log(`Is initially connected: ${isConnected}`);
  NetInfo.isConnected.removeEventListener(onInitialNetConnection);
};
NetInfo.isConnected.addEventListener(
  "connectionChange",
  onInitialNetConnection
);

@connect(data => LoginScreen.getDataProps)
export default class LoginScreen extends React.Component {
  static navigationOptions = {
    headerStyle: {
      height: 0,
      backgroundColor: "#C5E7FD",
      borderBottomColor: "transparent",
      elevation: 0
    },
    headerLeft: null // Disable back button
  };

  // Redux store
  static getDataProps(data) {
    return {
      currentUser: data.currentUser,
      isLoggedIn: data.apiState.isLoggedIn,
      last_theme: data.currentUser.theme
    };
  }

  constructor(props) {
    super(props);
    this.logoScaleValue = new Animated.Value(logoScaleSmallest);

    this.state = {
      form_user_code: "",
      stored_user_code: "",
      fingerprint_enabled: false,
      fingerprintSupported: false,
      fingerprintEnrolled: false,
      fingerprintModalVisible: false,
      login_button_disabled: false,
      activity_animating: false,
      progress_visible: false,
      progress_title: "",
      progress: 0.0,
      theme: ""
    };
  }

  // Non-render state
  username = "";
  password = "";
  api_server = Constants.manifest.extra.defaultCloudServer;
  panel_list = [];
  last_panel_id = null;
  progress_cancelled = false;

  logoScale() {
    startValue = logoScaleSmallest;
    endValue = logoScaleLargest;
    this.logoScaleValue.setValue(startValue);
    Animated.timing(this.logoScaleValue, {
      toValue: endValue,
      duration: 1000
    }).start(() => {});
  }

  // Initialise theme image cache, and fetch any secondary branding image (if present)
  async getThemeImages() {
    // Check if we know what our theme name is
    let themeconf = null;
    try {
      // Read our theme configuration (if any)
      data_string = await AsyncStorage.getItem(`@TexecomStore:theme`);
      if (data_string !== null) {
        themeconf = JSON.parse(data_string);
      }
    } catch (error) {
      // No cached theme info
    }

    // If we have a theme name, initialise the theme image cache.
    // Also look for any existing cached secondary branding image.
    let logoSecondaryImage = null;
    if (themeconf) {
      console.log("Theme: " + themeconf.theme);

      // Initialise the Theme module cache, so that we know in advance of
      // getting any image URIs which are already cached, rather than
      // looking for file existence every time we reference an image.
      ThemeInitialiseCache(themeconf.theme);

      // Set last theme name locally so we can update this.props.theme
      this.setState({ last_theme: themeconf.theme });

      // Check if we have a theme "powered-by" logo image
      const logo_secondary_path = await imageWithName(
        ThemeFolder(themeconf.theme),
        "logo-login-secondary"
      );
      if (logo_secondary_path !== null) {
        // Found a cached logo image
        logoSecondaryImage = ThemeImage(
          themeconf.theme,
          "logo-login-secondary.png"
        );
      }
    }

    // Set the final value of secondary image (will be null if no secondary image)
    this.setState({ logoSecondaryImage });
  }

  // Handle Linking URL
  linkingHandler = url => {
    let usingLinkingAccount = false;
    const { path, queryParams } = Linking.parse(url);
    console.log(`Linking path: ${path}, data: ${JSON.stringify(queryParams)}`);
    if (queryParams.useremail && queryParams.password) {
      console.log("Linking: passed login details");

      // Remember the login details
      this.username = queryParams.useremail;
      this.password = queryParams.password;
      this.api_server = `https://${queryParams.broker}`;
      this.setState({ form_user_code: queryParams.usercode });

      // Using passed login details
      usingLinkingAccount = true;
    }

    // Let caller know if we have already filled in account details
    return usingLinkingAccount;
  };

  // Linking listener
  linkingCallback = event => {
    console.log(`Linking Listener URL: ${event.url}`);
    this.linkingHandler(event.url);
  };

  async loadSavedCredentials() {
    // Get any stored username and password
    this.username = await SecureStore.getItemAsync(secureStoreUsername);
    this.password = await SecureStore.getItemAsync(secureStorePassword);
  }

  async loadSavedServer() {
    // Get any stored server URL
    this.api_server = await SecureStore.getItemAsync(secureStoreServer);
  }

  async loadStoredPanel() {
    // Check what the last panel used was
    this.last_panel_id = null;
    try {
      const user_conf = `${userSettingsPrefix(this.username)}_${
        this.api_server
      }_last_panel`;
      this.last_panel_id = await AsyncStorage.getItem(user_conf);
    } catch (e) {
      console.log("LoginScreen: No last-panel stored");
    }
  }

  async loadStoredPin() {
    // Check if we have decided a last panel to log in to
    if (this.last_panel_id) {
      // Check if user has a pin stored for the panel we're about to log in to.
      const lastPin = await codeStorageLastPinGet(
        this.last_panel_id,
        this.username
      );

      // Check if we had a pin
      if (lastPin) {
        // Check if this code is enabled for Remember Me or Fingerprint
        const remember_me_enabled = await codeStorageEnabled(
          this.last_panel_id,
          this.username,
          lastPin,
          "setting_remember_me"
        );
        const fingerprint_enabled = await codeStorageEnabled(
          this.last_panel_id,
          this.username,
          lastPin,
          "setting_fingerprint"
        );

        // Fill in pin form if Remember Me enabled
        if (remember_me_enabled) {
          // If Remember Me enabled, put the pin in the input form
          this.setState({ form_user_code: lastPin, fingerprint_enabled });
        } else {
          // Clear any stored pin
          this.setState({ form_user_code: "", fingerprint_enabled });
        }

        // Store pin code if Fingerprint enabled
        if (fingerprint_enabled) {
          // If Fingerprint enabled, keep the pin aside, in the input form
          this.setState({ stored_user_code: lastPin });
        }
      } else {
        // Clear any stored pin
        this.setState({ form_user_code: "" });
      }
    }
  }

  async componentWillMount() {
    // Activity while starting
    this.setActivity(true);

    // Print Linking URL
    console.log("Home: Linking URL " + Linking.makeUrl());

    // Add a listener for Linking requests
    Linking.addEventListener("url", this.linkingCallback);

    // load the help page index
    helpPages = require("../assets/help.json");

    // Load any cached theme images for branding
    this.getThemeImages();

    // Get any initial Linking URL if we weren't opened when it came in
    let usingLinkingAccount = false;
    linkingUrl = await Linking.getInitialURL();
    if (linkingUrl) {
      console.log("Linking opened with: " + linkingUrl);

      // Check whether we got login details passed by Linking or should
      // work as normal, reading any saved settings back in
      usingLinkingAccount = this.linkingHandler(linkingUrl);
    }

    // Using linking account details if we have any valid ones
    if (usingLinkingAccount) {
      console.log("Login: Using Linking-passed account details");
    } else {
      // No Linking details, load any stored user and server settings
      await this.loadSavedCredentials();
      await this.loadSavedServer();
    }

    // Fetch any stored pin for the cloud user and last panel used
    await this.loadStoredPanel();
    await this.loadStoredPin();

    // Activity while starting
    this.setActivity(false);

    // Check if the device supports fingerprints, has any user code stored,
    // and user has enabled biometric login.
    LocalAuthentication.hasHardwareAsync().then(fingerprintSupported =>
      LocalAuthentication.isEnrolledAsync().then(fingerprintEnrolled => {
        // Show the biometric button. We'll try to scan and login immediately,
        // but still show a button to initiate a rescan in case the user cancels
        // or fails the initial biometric scan
        this.setState({ fingerprintSupported, fingerprintEnrolled });

        // If enabled and we have a stored code, offer fingerprint login
        fingerprintSupported &&
          fingerprintEnrolled &&
          this.state.fingerprint_enabled &&
          this.state.stored_user_code &&
          this.fingerprintAuth();
      })
    );
  }

  componentDidMount() {
    // Keep track of whether we're mounted because
    // we can get callbacks from other components
    this._mounted = true;
    this.logoScale();
  }

  componentWillUnmount() {
    // Keep track of whether we're mounted because
    // we can get callbacks from other components
    this._mounted = false;

    // Clean up
    Linking.removeEventListener("url", this.linkingCallback);
  }

  // Update progress bar. Also returns true if the user cancelled the action.
  updateProgress = (progress_visible, progress_title, progress_value) => {
    this.setState({
      progress_visible: progress_visible,
      progress: progress_value,
      progress_title: progress_title
    });

    // Return false if progress was cancelled by clicking on cancel button
    return this.progress_cancelled;
  };

  onProgressCancelled = () => {
    // Mark as user cancelled, we'll return this state from updatePrrogress()
    this.progress_cancelled = true;
  };

  // Set activity state
  setActivity = animating => this.setState({ activity_animating: animating });

  // Re-enable login button, hide progress bar etc on login error
  onLoginFinished = () => {
    this.setState({
      login_button_disabled: false,
      activity_animating: false,
      progress_visible: false
    });

    // Clear any progress cancelled flag
    this.progress_cancelled = false;
  };

  // Log in
  async login(force_select_panel = false) {
    // Hide any open keyboard on clicking login
    Keyboard.dismiss();

    // Activity while logging in
    this.setActivity(true);

    // Check internet connectivity
    const isConnected = await NetInfo.isConnected.fetch();
    if (!isConnected) {
      this.toast_ref.show(
        AppTitle("You need a valid internet connection"),
        10 * 1000
      );
      this.onLoginFinished();
      return;
    }

    // Check we have a server and login details
    if (!this.api_server) {
      Alert.alert(AppTitle("Error"), AppTitle("No cloud server configured"));
      this.onLoginFinished();
      return;
    } else if (!this.username || !this.password) {
      Alert.alert(
        AppTitle("Error"),
        AppTitle("Please enter your username and password")
      );
      this.onLoginFinished();
      return;
    }

    // Set initial user info for tracking issues (don't know panel_id yet)
    Sentry.setUserContext({
      email: this.username,
      server: this.api_server,
      state: "Not authenticated"
    });

    // Start Analytics
    analyticsInit(this.username);

    // Get push token
    const push_tokens = await getPushTokensAsync();
    this.props.dispatch(Actions.setPushToken(push_tokens.expo));

    // Get locale to tell the cloud
    const device_locale = I18n.locale;

    //  Check we have  valid information to send
    if (!push_tokens.expo || !push_tokens.device || !device_locale) {
      Sentry.captureException(
        `Login: Invalid info tokens:${JSON.stringify(
          push_tokens
        )} locale:${JSON.stringify(device_locale)}`
      );
    }

    // Create a new user record with at least the theme name remembered from previous sessions.
    // This allows us to update Redux this.props.theme so that anything that wants to know the
    // theme (e.g. AppView.activity_animating) has it in advance before we log in
    const initial_user_info = {
      email: this.username,
      api_server: this.api_server,
      api_token: "",
      theme: this.state.last_theme,
      access: {}
    };
    this.props.dispatch(Actions.setCurrentUser(initial_user_info));

    // Log in and get a token from the backend. Send the push token if we got one.
    // Send the app slug, because the Expo API currently expects bulk push sends
    // to all be from the same slug, but we allow people to log in with the same
    // account on multiple slugs. The cloud might send to the same user across
    // multiple different app slugs.
    result_obj = await backendPostAsync(
      "/token/",
      {
        username: this.username,
        password: this.password,
        app: Constants.manifest.slug,
        push_token: push_tokens.expo,
        device_token: push_tokens.device,
        device_locale
      },
      this.api_server,
      null,
      null,
      null,
      LOGIN_TIMEOUT_MS
    );
    if (result_obj != null) {
      // Create a new user record with the returned API token for storing in Redux
      let user_info = {
        email: this.username,
        panel_user_code: this.state.form_user_code,
        api_server: this.api_server,
        api_token: result_obj.token,
        theme: this.state.last_theme,
        access: {}
      };

      // Set initial user info for tracking issues (don't know panel_id yet)
      Sentry.setUserContext({
        email: user_info.email,
        server: user_info.api_server,
        token: user_info.api_token,
        state: "Authenticated"
      });

      // Log successful authentication
      analyticsLogEvent("Authenticated");

      // Store user info in Redux store
      this.props.dispatch(Actions.setCurrentUser(user_info));

      // Fetch panel list to see if we need to load the panel select page
      this.panel_list = await backendGetAsync(
        "/api/texecom-app/site/list/",
        user_info.api_server,
        user_info.api_token,
        this.toast_ref
      );
      if (this.panel_list == null) {
        // Show alert
        Alert.alert(AppTitle("Error"), AppTitle("Failed to get panel list"));
        console.log("LoginScreen: no panels found");
        this.onLoginFinished();
      } else {
        // Decide which panel to log in to. If only one then use that, otherwise
        // if multiple panels we use the last one logged in to. If no last-panel
        // stored then make the user choose via the SelectPanel screen.
        panel_to_log_in_to = null;
        if (this.panel_list.length === 1) {
          // Only one panel on this account, use that one
          panel_to_log_in_to = { ...this.panel_list[0] };
        } else if (this.last_panel_id !== null) {
          // Multiple panels, look for a matching one
          this.panel_list.map(panel => {
            if (panel.panel_id === parseInt(this.last_panel_id)) {
              // Found a matching panel
              panel_to_log_in_to = { ...panel };
            }
          });
        }

        // If we found a panel to log in to, use that one, otherwise make user choose.
        // Also force select_panel if we got here via the Select Panel button.
        if (panel_to_log_in_to === null || force_select_panel) {
          // User should select panel, navigate to SelectPanel
          // If SelectPanel comes back here, re-enable the button.
          this.props.navigation.navigate("SelectPanel", {
            password: this.password,
            panel_list: this.panel_list,
            last_panel_id: this.last_panel_id,
            callback: panel => {
              // Note the new panel and fetch any stored pin for it
              this.last_panel_id = panel.panel_id;
              this.loadStoredPin();
            },
            onClose: () => {
              // Don't call setState if we get called back after unmounted
              if (this._mounted === true) {
                this.onLoginFinished();
              }
            }
          });
        } else {
          // Chosen a panel, validate the pin code
          if (!validatePanelUserCode(this.state.form_user_code)) {
            // Invalid user code
            Alert.alert(
              AppTitle("Error"),
              AppTitle(
                "Please check your Security System Code. It should be a 4, 5 or 6 digit code."
              )
            );
            this.onLoginFinished();
          } else {
            // Check if this code is enabled for Remember Me or Fingerprint. If so
            // we'll store it in secure storage
            const remember_me_enabled = await codeStorageEnabled(
              panel_to_log_in_to.panel_id,
              this.username,
              this.state.form_user_code,
              "setting_remember_me"
            );
            const fingerprint_enabled = await codeStorageEnabled(
              panel_to_log_in_to.panel_id,
              this.username,
              this.state.form_user_code,
              "setting_fingerprint"
            );
            if (remember_me_enabled || fingerprint_enabled) {
              // Store the pin in SecureStore, no need to wait for it to complete
              codeStorageLastPinSet(
                panel_to_log_in_to.panel_id,
                this.username,
                this.state.form_user_code
              );
            } else {
              // Storing code not enabled for this user: delete the last pin,
              // since it will be confusing if we leave it as whatever the login
              // code was a few logins ago. If you log in with a non-stored user
              // code it means there is no "last logged in" code.
              codeStorageLastPinDelete(
                panel_to_log_in_to.panel_id,
                this.username
              );
            }

            // Make sure the panel user list is synced with the cloud before we call setcode API.
            if (panel_to_log_in_to.panel_appsync === 0) {
              const users_synced = await backendPanelSync(
                panel_to_log_in_to.panel_id,
                this.api_server,
                user_info.api_token,
                `/api/texecom-app/user/download?panel_id=${
                  panel_to_log_in_to.panel_id
                }`,
                "Users",
                this.updateProgress,
                this.toast_ref,
                true
              );
              //  Log any error syncing
              if (!users_synced) {
                // Failed to synchronise users

                // Failure: Hide progress bar and enable login button again
                this.updateProgress(false, "", 0);
                this.onLoginFinished();

                // Warn user, use timeout so that initial modal has gone
                setTimeout(
                  () =>
                    Alert.alert(
                      AppTitle("Error"),
                      AppTitle("Failed to synchronise with panel")
                    ),
                  1000
                );
                Sentry.captureException("Login: Failed to sync users");

                // Quit login
                return;
              }
            }

            // Set the specified user code.
            result_obj = await backendPostAsync(
              "/api/texecom-app/site/setcode",
              {
                panel_id: panel_to_log_in_to.panel_id,
                panel_user_code: user_info.panel_user_code
              },
              this.api_server,
              user_info.api_token,
              this.toast_ref
            );
            if (result_obj === null) {
              // Failed to set user code
              Alert.alert(
                AppTitle("Error"),
                AppTitle("Please ensure your user code is correct")
              );

              // Re-enable login button
              this.onLoginFinished();
            } else {
              // User code was valid

              // Check the panel's status (online, needing migration)
              const ping_status = await backendPanelStatus(
                panel_to_log_in_to,
                user_info,
                this.setActivity
              );

              // Check if online
              if (!ping_status.good) {
                // Pop up to warn user
                Alert.alert(
                  AppTitle("Error"),
                  AppTitle(
                    "Failed to connect to panel, please check your network connection"
                  )
                );

                // Re-enable login button
                this.onLoginFinished();
              } else if (
                ping_status.needs_upgrade &&
                panel_to_log_in_to.panel_user &&
                panel_to_log_in_to.panel_user.access_firmware_upgrade === 1
              ) {
                // Re-enable login button
                this.onLoginFinished();

                // Start a SmartCom upgrade and user has rights to do so
                this.props.navigation.navigate("LoginSmartcomUpgrade", {
                  panel_to_log_in_to: panel_to_log_in_to,
                  user_info,
                  ping_status,
                  theme: this.state.last_theme
                });
              } else {
                // Status is good. Log in to it, and go on to the Timeline page on success
                backendPanelLogin(
                  panel_to_log_in_to,
                  user_info,
                  ping_status,
                  false,
                  this.updateProgress,
                  this.setActivity,
                  () => {
                    // Success: Enable login button again (but it will navigate off to main screen)
                    this.onLoginFinished();
                  },
                  () => {
                    // Failure: Enable login button again
                    this.onLoginFinished();
                  },
                  this.props.navigation
                );
              }
            }
          }
        }
      }
    } else {
      console.log("LoginScreen: Failed to log in");

      // Log failed authentication
      analyticsLogEvent("Authentication Fail");

      // Failed: show alert and direct user to change their cloud details
      this.onLoginFinished();
      Alert.alert(
        AppTitle("Error"),
        AppTitle("Failed to log in, please check your username and password"),
        [
          {
            text: AppTitle("OK"),
            onPress: () => navReset(this.props.navigation, "LoginCloud")
          }
        ],
        { cancelable: false }
      );
    }
  }

  fingerprintAuth = async () => {
    // No OS modal on Android, display our own
    if (Platform.OS === "android") {
      this.setState({ fingerprintModalVisible: true });
    }

    // Start waiting for fingerprint
    try {
      let result = await LocalAuthentication.authenticateAsync(
        AppTitle("Waiting for biometric login")
      );
      if (result.success) {
        // Success, fill in the password field, and call login
        this.setState(
          {
            form_user_code: this.state.stored_user_code,
            login_button_disbled: false
          },
          () => this.login()
        );
      }
    } finally {
      // Clear any modal
      this.setState({ fingerprintModalVisible: false });
    }
  };

  renderBiometricButton() {
    // Show Face ID vs Fingerprint button
    if (supportsFaceID()) {
      return (
        <TouchableOpacity
          style={commonStyles.button}
          onPress={this.fingerprintAuth}
          disabled={this.state.login_button_disabled}
        >
          <AppText style={commonStyles.buttonText}>Login with Face ID</AppText>
        </TouchableOpacity>
      );
    } else {
      return (
        <TouchableOpacity
          style={styles.circleButton}
          onPress={this.fingerprintAuth}
          disabled={this.state.login_button_disabled}
        >
          <Ionicons
            name={
              Platform.OS === "ios" ? "ios-finger-print" : "md-finger-print"
            }
            size={PRINT_SIZE}
            color={"white"}
            style={{
              backgroundColor: "transparent",
              alignSelf: "center"
            }}
          />
        </TouchableOpacity>
      );
    }
  }

  render() {
    // Don't show the screen until we have loaded (or found not necessary) any secondary theme image
    if (typeof this.state.logoSecondaryImage === undefined) {
      return <View style={commonStyles.imageBackgroundContainer} />;
    } else
      return (
        <AppView
          activity={this.state.activity_animating}
          activity_vertical_pad={48}
          setToastRef={ref => (this.toast_ref = ref)}
          style={commonStyles.imageBackgroundContainer}
        >
          <ImageBackground
            source={ThemeImage(this.state.last_theme, "background.png")}
            style={styles.backgroundContainer}
            fadeDuration={0}
          >
            <View style={styles.innerContainer}>
              <View style={styles.paddingContainer} />
              {/* Logo container: height depends on presence of secondary logo */}
              <View
                style={[
                  styles.logoContainer,
                  {
                    height:
                      this.state.logoSecondaryImage === null
                        ? Layout.window.height * 0.3
                        : Layout.window.height * 0.4
                  }
                ]}
              >
                {/* Main logo */}
                <Animated.Image
                  style={{
                    width: (Layout.window.width * 80) / 100,
                    height: (Layout.window.width * 20) / 100,
                    transform: [{ scale: this.logoScaleValue }]
                  }}
                  resizeMode={"contain"}
                  source={ThemeImage(this.state.last_theme, "logo-login.png")}
                />
                {/* Secondary logo (if present) */}
                {this.state.logoSecondaryImage !== null ? (
                  <View style={styles.logoSecondaryContainer}>
                    <Animated.Image
                      style={{
                        width: (Layout.window.width * 80) / 100,
                        height: (Layout.window.width * 20) / 100,
                        transform: [{ scale: this.logoScaleValue }]
                      }}
                      resizeMode={"contain"}
                      source={this.state.logoSecondaryImage}
                    />
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: "row" }}>
                <View style={{ flex: 1 }}>
                  <AppUnTextInput
                    style={commonStyles.textInput}
                    placeholder={AppTitle("Panel User Code")}
                    // iOS: number-pad needed to get rid of period key, but doesn't work on Android.
                    // Android: number-pad shows letters, need to use numeric instead.
                    keyboardType={
                      Platform.OS === "ios" ? "number-pad" : "numeric"
                    }
                    maxLength={6}
                    placeholderTextColor={"gray"}
                    secureTextEntry={true}
                    autoComplete={"off"}
                    autoCapitalize={"none"}
                    autoCorrect={false}
                    underlineColorAndroid={"transparent"}
                    onChangeText={text =>
                      this.setState({ form_user_code: text })
                    }
                    value={this.state.form_user_code}
                  />
                </View>

                <TouchableOpacity
                  onPress={() => {
                    this.setState({ login_button_disabled: true }, () =>
                      this.login(true)
                    );
                  }}
                  disabled={this.state.login_button_disabled}
                >
                  <View style={styles.homeContainer}>
                    <Image
                      style={styles.homeImage}
                      source={require("../assets/icons/home.png")}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[commonStyles.button, { marginVertical: 4 }]}
                onPress={() => {
                  this.setState({ login_button_disabled: true }, () =>
                    this.login()
                  );
                }}
                disabled={this.state.login_button_disabled}
              >
                <AppText style={commonStyles.buttonText}>Login</AppText>
              </TouchableOpacity>

              <View style={styles.forgottenContainer}>
                <TouchableOpacity
                  onPress={() => navReset(this.props.navigation, "LoginCloud")}
                >
                  <AppText style={commonStyles.linkButtonText}>
                    Change User Account
                  </AppText>
                </TouchableOpacity>
              </View>

              {/* Fingerprint button: show if we have a username/password & fingerprint is supported */}
              {this.state.fingerprintSupported &&
              this.state.fingerprintEnrolled &&
              this.state.stored_user_code
                ? this.renderBiometricButton()
                : null}

              {/* Android-only modal (no built-in OS modal on Android) */}
              <AppModal
                visible={this.state.fingerprintModalVisible}
                titleText={AppTitle("Authenticating")}
                subText={AppTitle("Waiting for biometric login")}
                onPressCancel={() => LocalAuthentication.cancelAuthenticate()}
              >
                <View style={{ alignSelf: "center" }}>
                  <Ionicons
                    name={"md-finger-print"}
                    size={PRINT_SIZE}
                    color={Colors.themeButton}
                    style={{ backgroundColor: "transparent" }}
                  />
                </View>
              </AppModal>

              {this.state.progress_visible ? (
                <ProgressModal
                  titleText={this.state.progress_title}
                  progress={this.state.progress}
                  cancelCallback={this.onProgressCancelled}
                />
              ) : null}
            </View>
          </ImageBackground>
        </AppView>
      );
  }
}

const styles = StyleSheet.create({
  backgroundContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  // Align with settingsContainer on LoginScreen
  paddingContainer: {
    paddingTop: 44 + Layout.window.height * 0.05
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center"
  },
  logoSecondaryContainer: {
    paddingTop: Layout.window.height * 0.05
  },
  forgottenContainer: {
    paddingTop: Layout.window.height * 0.05
  },
  homeContainer: {
    width: StyleSizes.TEXTINPUT_HEIGHT,
    height: StyleSizes.TEXTINPUT_HEIGHT,
    borderRadius: 8,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
    marginLeft: 8
  },
  homeImage: {
    width: (StyleSizes.TEXTINPUT_HEIGHT * 2) / 3,
    height: (StyleSizes.TEXTINPUT_HEIGHT * 2) / 3,
    tintColor: Colors.themeVeryLight,
    backgroundColor: "transparent"
  },
  innerContainer: {
    flex: 1,
    paddingHorizontal: 16
  },
  circleButton: {
    marginVertical: 4,
    width: PRINT_SIZE * 1.1,
    height: PRINT_SIZE * 1.1,
    borderRadius: (PRINT_SIZE * 1.1) / 2,
    backgroundColor: Colors.themeButton,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center"
  }
});
