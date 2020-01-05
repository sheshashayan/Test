import React from "react";
import {
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { connect } from "react-redux";
import * as FileSystem from "expo-file-system";

import Colors from "../constants/Colors";
import commonStyles from "../styles/CommonStyles";
import StyleSizes from "../styles/StyleSizes";
import Layout from "../constants/Layout";
import { AppFooter, AppView } from "../components/AppFramework";
import { AppText } from "../components/StyledText";
import { ThemeImage } from "../components/Theme";
import Swiper from "../forked_modules/react-native-swiper";
import { disclaimerTextFile } from "../components/StyledText";
import { imageWithName } from "../lib/ImageWithName";
import { getRouteMain } from "../lib/RouteSync";
import { navReset } from "../lib/navReset";
import backendFetchHelpImages from "../api/backendFetchHelpImages";
import { ProgressModal } from "../components/ProgressModal";

@connect(data => TutorialScreen.getDataProps)
export default class TutorialScreen extends React.Component {
  static navigationOptions = {
    headerStyle: {
      height: 0,
      backgroundColor: Colors.gradientStart,
      borderBottomColor: "transparent",
      elevation: 0
    },
    headerLeft: null // Disable back button
  };

  // Redux store
  static getDataProps(data) {
    return {
      currentUser: data.currentUser,
      theme: data.currentUser.theme
    };
  }

  state = {
    helpScreen: {},
    help_image: [],
    progress_visible: false,
    progress_title: "",
    progress: 0.0
  };

  componentWillMount = async () => {
    var help_pages = [];
    var help_image = [];
    const lang = disclaimerTextFile();
    const help_folder = `${FileSystem.documentDirectory}help/${lang}/`;
    // load the help page index
    helpPages = require("../assets/help.json");

    // build the list of pages
    const screens = helpPages.help.find(
      screen => screen.header === "App Overview"
    );
    this.setState({ helpScreen: screens });
    for (const page of screens.pages) help_pages.push(page.image);

    await backendFetchHelpImages(
      this.props.currentUser,
      help_pages,
      this.updateProgress
    );
    // Check the images folder exists
    folder_info = await FileSystem.getInfoAsync(help_folder);
    if (!Boolean(folder_info.exists)) {
      console.log(`Tutorial: help folder not found`);
      for (const help of help_pages)
        help_image.push(ThemeImage(this.props.theme, "logo-login.png"));
    } else {
      // Folder exists, check if an image exists for the user
      var page = 0;
      for (const help of help_pages) {
        const found_image = await imageWithName(help_folder, `${help}-`);
        if (found_image !== null) {
          // Found an existing cached user image on disk
          help_image.push({ uri: found_image, cache: "reload" });
        } else {
          console.log(`Tutorial: failed to find image ${help}`);
          help_image.push(ThemeImage(this.props.theme, "logo-login.png"));
        }
      }
      this.setState({ help_image });
    }
    console.log(JSON.stringify(this.state.help_image));
  };

  // Update progress bar. Also returns true if the user cancelled the action.
  updateProgress = (progress_visible, progress_title, progress_value) => {
    this.setState({
      progress_visible,
      progress: progress_value,
      progress_title
    });

    // Return false if progress was cancelled by clicking on cancel button
    return this.progress_cancelled;
  };

  onProgressCancelled = () => {
    // Mark as user cancelled, we'll return this state from updatePrrogress()
    this.progress_cancelled = true;
  };

  render() {
    if (this.props.navigation.state.params.button === "onboarding")
      return (
        <AppView
          setToastRef={ref => (this.toast_ref = ref)}
          style={styles.container}
        >
          {this.renderOnboarding()}
        </AppView>
      );
    else
      return (
        <AppView
          setToastRef={ref => (this.toast_ref = ref)}
          style={styles.container}
        >
          {this.renderHelp()}
        </AppView>
      );
  }
  renderOnboarding() {
    return (
      <ImageBackground
        source={require("../assets/images/Login.png")}
        style={styles.backgroundContainer}
        fadeDuration={0}
      >
        {this.renderContent()}
      </ImageBackground>
    );
  }

  renderHelp() {
    return <View style={styles.helpContainer}>{this.renderContent()}</View>;
  }

  renderContent() {
    return (
      <View style={styles.bodyContainer}>
        <Swiper
          height={Layout.window.height * 0.8}
          showsButtons={false}
          //showsPagination={false}
          //paginationStyle={{ bottom: Layout.window.height * 10 / 100 }}
          paginationStyle={{ bottom: 0 }}
          dotStyle={StyleSheet.flatten(styles.swiperDot)}
          activeDotStyle={StyleSheet.flatten(styles.swiperDotActive)}
          loop={false}
          removeClippedSubviews={false}
        >
          {this.renderSlide1()}
          {this.renderSlide2()}
          {this.renderSlide3()}
          {this.renderSlide4()}
          {this.renderSlide5()}
          {this.renderSlide6()}
        </Swiper>
        <View style={styles.bodyBackContainer}>{this.returnButton()}</View>
        {this.state.progress_visible ? (
          <ProgressModal
            titleText={this.state.progress_title}
            progress={this.state.progress}
            cancelCallback={this.onProgressCancelled}
          />
        ) : null}
        <AppFooter ref="footer" />
      </View>
    );
  }
  returnButton() {
    if (this.props.navigation.state.params.button === "onboarding") {
      return (
        <TouchableOpacity
          style={commonStyles.button}
          onPress={() => {
            // Figure out which main tab the user should see
            const routeName = getRouteMain(this.props.currentUser);

            // Go to the main tab, resetting the stack to get rid of all
            // the on-boarding stuff
            navReset(this.props.navigation, routeName);
          }}
        >
          <AppText style={commonStyles.buttonText}>Login</AppText>
        </TouchableOpacity>
      );
    } else {
      return (
        <TouchableOpacity
          style={commonStyles.button}
          onPress={() => this.props.navigation.goBack()}
        >
          <AppText style={commonStyles.buttonText}>Return to App</AppText>
        </TouchableOpacity>
      );
    }
  }

  renderSlide1() {
    const content = this.state.helpScreen.pages.find(
      page => page.title === "Stay Secure"
    );
    return (
      <View style={styles.container}>
        <View style={styles.bodyTitleContainer}>
          <AppText style={styles.pageTitleText}>{content.title}</AppText>
        </View>
        <View style={styles.bodyIconContainer}>
          <Image style={styles.imageStyle} source={this.state.help_image[0]} />
        </View>
        <View style={styles.bodyContainer}>
          <AppText style={styles.pageSubTitleText}>{content.subtitle}</AppText>
          <AppText style={styles.pageText}>{content.text}</AppText>
        </View>
      </View>
    );
  }

  renderSlide2() {
    const content = this.state.helpScreen.pages.find(
      page => page.title === "Track Events"
    );
    return (
      <View style={styles.container}>
        <View style={styles.bodyTitleContainer}>
          <AppText style={styles.pageTitleText}>{content.title}</AppText>
        </View>
        <View style={styles.bodyIconContainer}>
          <Image style={styles.imageStyle} source={this.state.help_image[1]} />
        </View>
        <View style={styles.bodyContainer}>
          <AppText style={styles.pageSubTitleText}>{content.subtitle}</AppText>
          <AppText style={styles.pageText}>{content.text}</AppText>
        </View>
      </View>
    );
  }

  renderSlide3() {
    const content = this.state.helpScreen.pages.find(
      page => page.title === "Property"
    );
    return (
      <View style={styles.container}>
        <View style={styles.bodyTitleContainer}>
          <AppText style={styles.pageTitleText}>{content.title}</AppText>
        </View>
        <View style={styles.bodyIconContainer}>
          <Image style={styles.imageStyle} source={this.state.help_image[2]} />
        </View>
        <View style={styles.bodyContainer}>
          <AppText style={styles.pageSubTitleText}>{content.subtitle}</AppText>
          <AppText style={styles.pageText}>{content.text}</AppText>
        </View>
      </View>
    );
  }

  renderSlide4() {
    const content = this.state.helpScreen.pages.find(
      page => page.title === "Devices"
    );
    return (
      <View style={styles.container}>
        <View style={styles.bodyTitleContainer}>
          <AppText style={styles.pageTitleText}>{content.title}</AppText>
        </View>
        <View style={styles.bodyIconContainer}>
          <Image style={styles.imageStyle} source={this.state.help_image[3]} />
        </View>
        <View style={styles.bodyContainer}>
          <AppText style={styles.pageSubTitleText}>{content.subtitle}</AppText>
          <AppText style={styles.pageText}>{content.text}</AppText>
        </View>
      </View>
    );
  }

  renderSlide5() {
    const content = this.state.helpScreen.pages.find(
      page => page.title === "Recipes"
    );
    return (
      <View style={styles.container}>
        <View style={styles.bodyTitleContainer}>
          <AppText style={styles.pageTitleText}>{content.title}</AppText>
        </View>
        <View style={styles.bodyIconContainer}>
          <Image style={styles.imageStyle} source={this.state.help_image[4]} />
        </View>
        <View style={styles.bodyContainer}>
          <AppText style={styles.pageSubTitleText}>{content.subtitle}</AppText>
          <AppText style={styles.pageText}>{content.text}</AppText>
        </View>
      </View>
    );
  }

  renderSlide6() {
    const content = this.state.helpScreen.pages.find(
      page => page.title === "Modes"
    );
    return (
      <View style={styles.container}>
        <View style={styles.bodyTitleContainer}>
          <AppText style={styles.pageTitleText}>{content.title}</AppText>
        </View>
        <View style={styles.bodyIconContainer}>
          <Image style={styles.imageStyle} source={this.state.help_image[5]} />
        </View>
        <View style={styles.bodyContainer}>
          <AppText style={styles.pageSubTitleText}>{content.subtitle}</AppText>
          <AppText style={styles.pageText}>{content.text}</AppText>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 0
  },
  helpContainer: {
    flex: 1,
    paddingTop: 0,
    backgroundColor: Colors.gradientStart
  },
  backgroundContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  bodyTitleContainer: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingVertical: 2
  },
  bodyIconContainer: {
    flex: 3,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingHorizontal: 8,
    paddingTop: 8
  },
  bodyContainer: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingTop: 2,
    marginBottom: 10
  },
  bodyBackContainer: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingVertical: 2,
    backgroundColor: "transparent",
    height: StyleSizes.BUTTON_HEIGHT * 2,
    width: Layout.window.width - 32
  },
  imageStyle: {
    width: (Layout.window.width * 65) / 100,
    height: (Layout.window.width * 65) / 100
  },
  swiperDotActive: {
    backgroundColor: "white",
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 3,
    marginRight: 3,
    marginTop: 3,
    marginBottom: 3
  },
  swiperDot: {
    backgroundColor: "transparent",
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "white",
    marginLeft: 3,
    marginRight: 3,
    marginTop: 3,
    marginBottom: 3
  },
  pageTitleText: {
    color: "white",
    fontSize: StyleSizes.TEXT_LARGE_TITLE_SIZE,
    paddingBottom: 16,
    justifyContent: "center",
    textAlign: "center",
    backgroundColor: "transparent"
  },
  pageSubTitleText: {
    color: "white",
    fontSize: StyleSizes.TEXT_STD_SIZE,
    paddingBottom: 16,
    justifyContent: "center",
    textAlign: "center",
    backgroundColor: "transparent"
  },
  pageText: {
    color: "white",
    fontSize: StyleSizes.TEXT_SMALL_SIZE,
    paddingBottom: 16,
    justifyContent: "center",
    textAlign: "center",
    backgroundColor: "transparent"
  }
});
