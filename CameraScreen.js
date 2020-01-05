import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { connect } from "react-redux";
import { NavigationActions } from "react-navigation";
import Sentry from "sentry-expo";

import Colors from "../constants/Colors";
import { AppTitle } from "../components/StyledText";
import commonStyles from "../styles/CommonStyles";
import CameraTabNavigator from "../navigation/CameraTabNavigator";
import backendGetAsync from "../api/backendGetAsync";
import HeaderIcon from "../components/HeaderButton";
import { ThemeImage } from "../components/Theme";

@connect(data => CameraScreen.getDataProps)
export default class CameraScreen extends React.Component {
  static navigationOptions = ({ navigation }) => {
    return {
      title: navigation.getParam("title", navigation.state.params.camera.name),
      headerRight:
        typeof navigation.state.params.headerButton !== "undefined" ? (
          navigation.state.params.headerButton()
        ) : (
          <View />
        )
    };
  };

  // Redux store
  static getDataProps(data) {
    return {
      currentUser: data.currentUser,
      panel: data.apiState.panel.data
    };
  }
  state = {
    camera: this.props.navigation.state.params.camera,
    swiperIndex: -1,
    currentTab: "Live",
    videoClips: [], // information about each video clip
    videoIndexUrl: [], // URL of frame 1 for the film roll
    videoConversionCompleted: false // Flag to check if conversion is completed. If completed make true and send as props to Live screen, to remove the loading indicator.
  };

  // Fix warning about rendering multiple navigators
  static router = CameraTabNavigator.router;

  // List of change handlers for each tab
  changeHandlers = {};
  animationHandlers = {};
  videoIndexData = []; // prefetch data from videoIndexUrl

  // Handle screen being unmounted

  componentDidMount() {
    // Keep track of whether we're mounted
    this._unmounted = false;
  }

  componentWillMount() {
    // Register for route-change, since we can't use onNavigationStateChange()
    // with React Navigation 2.
    this.props.screenProps.registerNavRouteChange(this.changeTab);

    for (var index = 0; index < 8; index++) {
      this.state.videoIndexUrl[index] = null;
    }

    // Fetch the video clips list
    this.fetchVideoClips();
  }

  componentWillUnmount() {
    // Prevent any callbacks doing stuff after we've unmounted
    this._unmounted = true;

    // Kill the handler when we're gone
    this.props.screenProps.deregisterNavRouteChange(this.changeTab);
  }

  // A function to allow children to conditionally render plus buttons in the right of header.
  // This allows sub-pages to optionally call us and add buttons if they need them.
  setInfoHeaderButton = callback => {
    // Normal setParams() is not updating state.params.headerButton since React-Navigation 2
    // but rather state.routes[0].params.headerButton. Use dispatch instead.
    const setParamsAction = NavigationActions.setParams({
      params: { headerButton: callback },
      key: this.props.navigation.state.key
    });
    this.props.navigation.dispatch(setParamsAction);
  };

  fetchVideoClips = async () => {
    console.log(
      `fetchRecordStatus for camera ${this.state.camera.name} / ${
        this.state.camera.camera.panel_camera_id
      }`
    );
    const result = await backendGetAsync(
      `/api/texecom-app/camera/clips/record/status?panel_camera_id=${
        this.state.camera.camera.panel_camera_id
      }`,
      this.props.currentUser.api_server,
      this.props.currentUser.api_token,
      null,
      null
    );
    // If successful, set in local state to force render of timer list
    if (result === null) {
      console.log("Failed to fetch record status");
    } else if (result.recording !== false) {
      // background_task_pid will be equal to zero if the video is processed. If not zero refetch till the value is zero
      if (!this._unmounted) {
        setTimeout(() => this.fetchVideoClips(), 500);
      }
    } else {
      // Fetch video clip list
      console.log(
        `fetchVideoClips for camera ${this.state.camera.name} / ${
          this.state.camera.camera.panel_camera_id
        }`
      );
      for (var index = 0; index < 8; index++) {
        this.state.videoIndexUrl[index] = null;
      }

      const videoClips = await backendGetAsync(
        `/api/texecom-app/camera/clips/list?panel_camera_id=${
          this.state.camera.camera.panel_camera_id
        }`,
        this.props.currentUser.api_server,
        this.props.currentUser.api_token,
        null,
        null
      );
      // If successful, set in local state to force render of timer list
      if (videoClips === null || videoClips.response === "error") {
        console.log("Failed to fetch video clip list");
      } else if (!this._unmounted) {
        // once background_task_pid is zero videoConversionCompleted will be made to true and passed on as props to live screen
        this.setState({ videoConversionCompleted: true });
        this.generateUrls(videoClips);
        this.fetchIndices(videoClips);
        if (!this._unmounted) {
          this.setState({ videoClips });
        }
      }
    }
  };

  generateUrls = videoClips => {
    const id = Date.now();
    const url = `${
      this.props.currentUser.api_server
    }/api/texecom-app/camera/clips/thumbnail?panel_camera_clip_id`;

    for (var index = 0; index < videoClips.length; index++) {
      still = videoClips[index];

      // Check for valid clip ID
      if (typeof still.panel_camera_clip_id === "undefined") {
        const debug = `Camera generateUrls: panel_camera_clip_id is undefined for index ${index}`;
        console.log(debug);
        Sentry.captureException(debug);
      } else {
        this.state.videoIndexUrl[index] = `${url}=${
          still.panel_camera_clip_id
        }&live=${id}&token=${this.props.currentUser.api_token}`;
      }
    }
  };

  fetchIndices = async videoClips => {
    //    console.log("Prefetch clip indices....");
    for (var index = 0; index < videoClips.length; index++) {
      //      console.log(this.state.videoIndexUrl[index]);
      if (this.videoIndexData[index] !== null) {
        try {
          this.videoIndexData[index] = Image.prefetch(
            this.state.videoIndexUrl[index]
          );
        } catch (error) {
          console.log(`fetchIndices() error loading frame ${error}`);
        }
      }
    }
    await Promise.all(this.videoIndexData)
      .then(results => {
        //console.log("All indices prefetched in parallel");
      })
      .catch(error => console.log(`fetchIndices() error ${error}`));

    if (
      !this._unmounted &&
      typeof this.animationHandlers[this.state.currentTab] !== "undefined"
    ) {
      this.animationHandlers[this.state.currentTab]();
    }
    console.log(`Prefetch clip indices complete, ${index} clip indices`);
  };

  changeTab = name => {
    if (!name) return null;
    console.log(
      `Camera: ChangeTab ${name}, currentTab ${this.state.currentTab}`
    );

    // save the current tab & don't call the change handler first time in
    // or if the tab name hasn't changed
    let prevTab = this.state.currentTab;

    //update the tab name
    this.setState({ currentTab: name });
    if (prevTab !== undefined && prevTab !== name) {
      //      console.log(`changeTab(${prevTab}) call changeHandlers`);
      if (typeof this.changeHandlers[name] !== "undefined") {
        this.changeHandlers[name]();
      }
    }
  };

  changeCamera = (camera, index) => {
    if (!camera) return null;
    console.log(`Change camera ${camera.name}, ${index}`);
    // setParams() didn't work with REactNavigation2 so use dispatch() instead
    const setParamsAction = NavigationActions.setParams({
      params: { title: camera.name },
      key: this.props.navigation.state.key
    });
    this.props.navigation.dispatch(setParamsAction);
    this.setState({ camera: camera, swiperIndex: index }, this.fetchVideoClips);
  };

  // Called by sub-tab screens to register their add routine
  registerChangeHandler = (tab, callback) => {
    // Add a handler for the tab name (e.g. addHandlers["Recipes"])
    this.changeHandlers[tab] = callback;
  };

  // Called by sub-tab screens to register their animation hanfling routine
  registerAnimationHandler = (tab, callback) => {
    // Add a handler for the tab name (e.g. addHandlers["Recipes"])
    this.animationHandlers[tab] = callback;
  };

  render() {
    return (
      <View style={styles.container}>
        <CameraTabNavigator
          navigation={this.props.navigation}
          screenProps={{
            camera: this.state.camera,
            swiperIndex: this.state.swiperIndex,
            currentTab: this.state.currentTab,
            videoClips: this.state.videoClips,
            videoIndexUrl: this.state.videoIndexUrl,
            refresh: this.fetchVideoClips,
            isConversionComplete: this.state.videoConversionCompleted,
            changeTab: name => this.changeTab(name),
            changeCamera: (camera, index) => this.changeCamera(camera, index),
            registerChangeHandler: (tab, callback) =>
              this.registerChangeHandler(tab, callback),
            registerAnimationHandler: (tab, callback) =>
              this.registerAnimationHandler(tab, callback),
            setHeaderButton: callback => this.setInfoHeaderButton(callback)
          }}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 0,
    backgroundColor: "white"
  }
});
