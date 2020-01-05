import React from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { connect } from "react-redux";
import { FontAwesome } from "@expo/vector-icons";
import ModalSelector from "../forked_modules/react-native-modal-selector";

import backendGetAsync from "../api/backendGetAsync";
import backendPostAsync from "../api/backendPostAsync";
import Actions from "../state/Actions";
import Layout from "../constants/Layout";
import { AppView, AppFooter } from "../components/AppFramework";
import commonStyles from "../styles/CommonStyles";
import StyleSizes from "../styles/StyleSizes";
import { AppText, AppTitle, AppUnText } from "../components/StyledText";
import HeaderTitle from "../components/HeaderTitle";
import { ThemeImage } from "../components/Theme";

let pkg = require("../package.json");

@connect(data => SettingsSystemDetailsScreen.getDataProps)
export default class SettingsSystemDetailsScreen extends React.Component {
  static navigationOptions = ({ navigation }) => ({
    headerTitle: <HeaderTitle>{AppTitle("System Details")}</HeaderTitle>,
    headerRight: <View />
  });

  // Redux store
  static getDataProps(data) {
    return {
      currentUser: data.currentUser,
      theme: data.currentUser.theme,
      panel: data.apiState.panel.data,
      pushToken: data.apiState.pushToken
    };
  }

  state = {
    smartcom_version: this.props.panel.panel_smartcom,
    activity_animating: false,
    update_available: null,
    show_timezone_picker: false
  };

  // Non-render state
  _timezoneList = null;

  componentWillMount = () => {
    // Fetch the current SmartCom firmware version
    backendGetAsync(
      `/api/texecom-app/site/ping?panel_id=${this.props.panel.panel_id}`,
      this.props.currentUser.api_server,
      this.props.currentUser.api_token
    ).then(ping_status =>
      this.setState({
        smartcom_version:
          ping_status && ping_status.response === "result"
            ? ping_status.details.smartcom_version
            : null
      })
    );

    // Set update_available to trigger re-render if an update is available
    try {
      // Show update available if enabled in app.json
      if (!Expo.Constants.manifest.updates.enabled) {
        // Updates disabled
      } else if (!__DEV__) {
        // Updates enabled
        Expo.Updates.checkForUpdateAsync().then(result => {
          if (result.isAvailable) {
            this.setState({ update_available: result.manifest });
          }
        });
      }
    } catch (e) {
      console.log("System details: filed to check for updates");
    }
  };

  softwareUpdate = async () => {
    // Fetch the latest version (while showing activity indicator)
    this.setState({ activity_animating: true });
    await Expo.Updates.fetchUpdateAsync();
    this.setState({ activity_animating: false });

    // Reload to the new version
    Expo.Updates.reload();
  };

  version = device => {
    return typeof device === "undefined" || device === null ? null : (
      <AppUnText numberOfLines={1} style={styles.listTextBold}>
        {device.slice(1)}
      </AppUnText>
    );
  };

  timezonePickerCallback = async panel_timezone => {
    console.log("SystemDetails: Selected timezone ", panel_timezone);

    // Check the user didn't cancel
    if (panel_timezone !== AppTitle("Cancel")) {
      // Set the timezone in the cloud
      this.setState({ activity_animating: true });
      const status = await backendPostAsync(
        `/api/texecom-app/timezone/set`,
        {
          panel_id: this.props.panel.panel_id,
          panel_timezone
        },
        this.props.currentUser.api_server,
        this.props.currentUser.api_token,
        this.toast_ref
      );
      this.setState({ activity_animating: false });

      // If we successfully set in the backend, tore the new timezone in Redux
      if (status) {
        // Update Redux
        let panel_info = { ...this.props.panel };
        panel_info.panel_timezone = panel_timezone;
        this.props.dispatch(
          Actions.setPanel({
            panel_info,
            persist_data: false,
            data: panel_info
          })
        );
      }
    }

    // Hide the picker modal
    this.setState({ show_timezone_picker: false });
  };

  renderTimezonePicker = () => {
    let index = 0;

    // Set label/title
    let data = [
      { key: index++, section: true, label: AppTitle("Panel Timezone") }
    ];

    // Fill in the timezone list
    for (timezone of this._timezoneList) {
      data.push({ key: index++, label: timezone.timezone });
    }

    return (
      <View>
        {this.state.show_timezone_picker ? (
          <View style={{ flex: 1, justifyContent: "space-around" }}>
            <ModalSelector
              data={data}
              animationType={"none"}
              startVisible={true}
              backdropPressToClose={true}
              onChange={option => {
                // Can't have multiple modals visible at once, open when picker closes
                setTimeout(
                  () => this.timezonePickerCallback(option.label),
                  1000
                );
              }}
              onCancel={() =>
                this.timezonePickerCallback(AppTitle("Cancel"), null)
              }
              cancelText={AppTitle("Cancel")}
            >
              {/* Don't show ModalSelector's built in button, we'll start it already visible */}
              <View />
            </ModalSelector>
          </View>
        ) : null}
      </View>
    );
  };

  enableTimezonePicker = async enable => {
    // Check if enabling or disabling
    if (enable && !this._timezoneList) {
      // If we haven't yet fetched the timezone list, then show activity
      // indicator and fetch timezone list. Short timeout of 15 seconds
      // because it doesn't need to do any database access
      this.setState({ activity_animating: true });
      this._timezoneList = await backendGetAsync(
        `/json/timezones.json`,
        this.props.currentUser.api_server,
        this.props.currentUser.api_token,
        this.toast_ref,
        null,
        15000
      );

      // Hide activity indicator
      this.setState({
        activity_animating: false
      });
    }

    // Show or hide the picker, as long as we have the timezone list
    if (this._timezoneList) {
      this.setState({ show_timezone_picker: enable });
    }
  };

  render() {
    return (
      <AppView
        activity={this.state.activity_animating}
        setToastRef={ref => (this.toast_ref = ref)}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.listContainer}>
            {/* App Version */}
            <View style={styles.listMainContainer}>
              <View style={styles.listLeftContainer}>
                <Image
                  source={ThemeImage(this.props.theme, "app-version.png")}
                  style={styles.listImage}
                />
                <View style={styles.listTextContainerMultiline}>
                  <AppUnText numberOfLines={1} style={styles.listTextBold}>
                    {Expo.Constants.manifest.version}.
                    {Expo.Constants.manifest.ios.buildNumber}
                  </AppUnText>
                  <AppUnText numberOfLines={1} style={styles.listSubtext}>
                    {AppTitle("App Version")}
                  </AppUnText>
                </View>
              </View>
              <View style={styles.listRightContainer}>
                {this.state.update_available !== null ? (
                  <TouchableOpacity
                    style={commonStyles.button}
                    onPress={() => this.softwareUpdate()}
                  >
                    <AppText style={commonStyles.buttonText}>Update</AppText>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Panel type */}
            <View style={styles.listMainContainer}>
              <View style={styles.listLeftContainer}>
                <Image
                  source={ThemeImage(this.props.theme, "panel-type.png")}
                  style={styles.listImage}
                />
                <View style={styles.listTextContainerMultiline}>
                  <AppUnText numberOfLines={1} style={styles.listTextBold}>
                    {this.props.panel.panel_model}
                  </AppUnText>
                  <AppUnText numberOfLines={1} style={styles.listSubtext}>
                    {AppTitle("Panel Type")}
                  </AppUnText>
                </View>
              </View>
            </View>

            {/* Panel version */}
            <View style={styles.listMainContainer}>
              <View style={styles.listLeftContainer}>
                <Image
                  source={ThemeImage(this.props.theme, "panel-version.png")}
                  style={styles.listImage}
                />
                <View style={styles.listTextContainerMultiline}>
                  {this.version(this.props.panel.panel_version)}
                  <AppUnText numberOfLines={1} style={styles.listSubtext}>
                    {AppTitle("Firmware Version")}
                  </AppUnText>
                </View>
              </View>
            </View>

            {/* SmartCom version */}
            <View style={styles.listMainContainer}>
              <View style={styles.listLeftContainer}>
                <Image
                  source={ThemeImage(this.props.theme, "panel-version.png")}
                  style={styles.listImage}
                />
                <View style={styles.listTextContainerMultiline}>
                  {this.version(this.state.smartcom_version)}
                  <AppUnText numberOfLines={1} style={styles.listSubtext}>
                    {AppTitle("Smartcom Version")}
                  </AppUnText>
                </View>
              </View>
            </View>

            {/* Panel timezone */}
            <TouchableWithoutFeedback
              onPress={() =>
                this.enableTimezonePicker(!this.state.show_timezone_picker)
              }
            >
              <View style={styles.listMainContainer}>
                <View style={styles.listLeftContainer}>
                  <Image
                    source={ThemeImage(this.props.theme, "settings.png")}
                    style={styles.listImage}
                  />
                  <View style={styles.listTextContainerMultiline}>
                    <AppUnText numberOfLines={1} style={styles.listTextBold}>
                      {this.props.panel.panel_timezone}
                    </AppUnText>
                    <AppUnText numberOfLines={1} style={styles.listSubtext}>
                      {AppTitle("Panel Timezone")}
                    </AppUnText>
                  </View>
                </View>
                <View style={styles.listEntryRightContainer}>
                  <FontAwesome
                    name={"angle-down"}
                    size={StyleSizes.LIST_RIGHT_ICON_SIZE}
                    color="black"
                  />
                </View>
              </View>
            </TouchableWithoutFeedback>
            {this.state.show_timezone_picker
              ? this.renderTimezonePicker()
              : null}

            <View style={styles.listDetailsContainer}>
              <View
                style={[styles.listTextContainerMultiline, { paddingLeft: 0 }]}
              >
                <AppUnText style={styles.listMainNarrowBox}>
                  {this.props.panel.panel_installerdetails}
                </AppUnText>
                <AppUnText numberOfLines={1} style={styles.listSubtextNarrow}>
                  {AppTitle("Installer Details")}
                </AppUnText>
              </View>
            </View>
          </View>
        </ScrollView>
        <View style={commonStyles.footer}>
          <AppText style={commonStyles.footerText}>
            Here are the details of Your Security System, Smartcom and App
          </AppText>
        </View>
        <AppFooter ref="footer" />
      </AppView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "space-between",
    backgroundColor: "white"
  },
  listContainer: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "space-between"
  },
  listMainContainer: {
    flex: 1,
    flexDirection: "row",
    height: StyleSizes.ENTRY_HEIGHT,
    paddingHorizontal: 8,
    alignItems: "center"
  },
  listDetailsContainer: {
    flex: 3,
    flexDirection: "row",
    paddingHorizontal: 8,
    alignItems: "center"
  },
  scrollContainer: {
    flex: 1,
    justifyContent: "space-between"
  },
  listLeftContainer: {
    flex: 2,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center", // Align text vertically
    paddingLeft: 8
  },
  listRightContainer: {
    justifyContent: "flex-end",
    alignItems: "center", // Align text vertically
    paddingRight: 8
  },
  listImage: {
    width: StyleSizes.IMAGE_SIZE,
    height: StyleSizes.IMAGE_SIZE,
    //    width: 36,
    //    height: 36,
    borderRadius: 18
  },
  listTextContainerMultiline: {
    flexDirection: "column",
    paddingLeft: 16
  },
  listTextBold: {
    fontSize: StyleSizes.TEXT_STD_SIZE,
    paddingHorizontal: 8
  },
  listSubtext: {
    fontSize: StyleSizes.TEXT_SMALL_SIZE,
    paddingHorizontal: 8
  },
  listMainNarrowBox: {
    flex: 3,
    flexDirection: "column",
    width: Layout.window.width * 0.9,
    fontSize: StyleSizes.TEXT_STD_SIZE,
    marginHorizontal: 16,
    paddingHorizontal: 8,
    alignItems: "center",
    borderStyle: "solid",
    borderWidth: 1
  },
  listSubtextNarrow: {
    fontSize: StyleSizes.TEXT_SMALL_SIZE,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginHorizontal: 16
  }
});
