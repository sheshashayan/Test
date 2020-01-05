import React from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";
import { connect } from "react-redux";

import Layout from "../constants/Layout";
import commonStyles from "../styles/CommonStyles";
import StyleSizes from "../styles/StyleSizes";
import { AppHeader, AppFooter, AppSwitch } from "../components/AppFramework";
import { AppText, AppTitle, AppUnText } from "../components/StyledText";
import HeaderTitle from "../components/HeaderTitle";
import { ThemeImage } from "../components/Theme";
import { isOnState } from "../constants/TexecomOutputModes";

@connect(data => RecipeCauseChooseStateScreen.getDataProps)
export default class RecipeCauseChooseStateScreen extends React.Component {
  static navigationOptions = ({ navigation }) => ({
    headerTitle: <HeaderTitle>{navigation.state.params.navTitle}</HeaderTitle>,
    headerRight: <View />
  });

  // Redux store
  static getDataProps(data) {
    return {
      currentUser: data.currentUser,
      theme: data.currentUser.theme,
      panel: data.apiState.panel.data
    };
  }

  state = {
    toggle_state: 0
  };

  goBack = num_screens => {
    const params = this.props.navigation.state.params;

    // If called from tab nav, need to go back more screens
    if (params.called_from_tabnav) {
      this.props.navigation.pop(1 + num_screens);
    } else {
      this.props.navigation.pop(num_screens);
    }
  };

  onSubmit = () => {
    const params = this.props.navigation.state.params;

    // For device effects, offer timed output modes.
    // For all causes, offer pulse timers
    if (
      params.type === "effects" &&
      params.object_to_change.type === "device" &&
      params.object_to_change.name !== "IP Camera"
    ) {
      // Open output mode select page, we'll save and return later
      this.props.navigation.navigate("RecipeEffectOutputMode", {
        caller: params.caller,
        mode: params.object_to_change.mode,
        toggle_state: this.state.toggle_state,
        onSubmit: (mode, duration) =>
          this.onChangeEffectOutputMode(mode, duration)
      });
    } else if (params.type === "causes") {
      // If logged in as Engineer
      if (this.props.currentUser.access.panel_user_type === "Engineer") {
        // Engineer: Open pulse timer select page, we'll save and return later
        this.props.navigation.navigate("RecipeCausePulseTimer", {
          pulse_timer: params.object_to_change.pulse_timer,
          toggle_state: this.state.toggle_state,
          device_icon: params.object_to_change.icon,
          onSubmit: pulse_timer => this.onChangeCausePulseTimer(pulse_timer)
        });
      } else {
        // Non-Engineer: Don't open pulse timer page, just save now as follow cause
        params.object_to_change.pulse_timer = 0;
        params.object_to_change.state = this.state.toggle_state;

        // Now save and return
        this.saveAndReturn(1);
      }
    } else {
      // Update the toggle state in the recipe
      params.object_to_change.state = this.state.toggle_state;

      // Go straight to save and return to caller (only 1 screen to go back through)
      this.saveAndReturn(1);
    }
  };

  onChangeCausePulseTimer = pulse_timer => {
    const params = this.props.navigation.state.params;
    console.log("onChangeCausePulseTimer");

    // Update the pulse timer in the cause
    params.object_to_change.pulse_timer = pulse_timer;
    params.object_to_change.state = this.state.toggle_state;

    // Now save and return
    this.saveAndReturn(2);
  };

  onChangeEffectOutputMode = (mode, duration) => {
    const params = this.props.navigation.state.params;
    console.log("onChangeEffectOutputMode");

    // Update the mode in the effect
    params.object_to_change.mode.value = mode;
    params.object_to_change.mode.duration = duration;

    // Now save and return
    this.saveAndReturn(2);
  };

  saveAndReturn = num_screens => {
    const params = this.props.navigation.state.params;

    // Go back to the caller
    this.goBack(num_screens);

    // Tell the RecipeEdit page what was selected
    params.onSelect(params.type, params.index, params.object_to_change);
  };

  onRemove = () => {
    const params = this.props.navigation.state.params;

    // Go back to the caller
    this.goBack(1);

    // Tell the RecipeEdit page what was selected
    params.onRemove(params.type, params.index);
  };

  componentWillMount() {
    const params = this.props.navigation.state.params;

    // Set the initial toggle state if multiple state
    if (params.object_to_change.states.length === 2) {
      // For causes, we know the initial toggle state. For effects with
      // output modes we set it based on the output mode (ON vs OFF)
      if (
        params.type === "effects" &&
        typeof params.object_to_change.mode !== "undefined"
      ) {
        this.setState({
          toggle_state: isOnState(params.object_to_change.mode.value) ? 0 : 1
        });
      } else {
        this.setState({ toggle_state: params.object_to_change.state });
      }
    }
  }

  render() {
    const params = this.props.navigation.state.params;
    const object = params.object_to_change;
    const showRemove = params.onRemove !== null;
    return (
      <View style={styles.container}>
        <AppHeader ref="header" />

        <View style={styles.innerContainer}>
          <View>
            <View style={styles.titleContainer}>
              <AppUnText style={styles.textStyle}>{object.title}</AppUnText>
              <AppUnText style={styles.textStyle}>
                {AppTitle(object.name)}
              </AppUnText>
            </View>
          </View>

          <View>
            <Image
              source={ThemeImage(this.props.theme, object.icon)}
              style={styles.iconImage}
            />
          </View>

          <View style={{ alignItems: "center" }}>
            {/* Final items aligned to the bottom */}
            {object.states.length === 2 ? (
              <View style={styles.rowContainer}>
                <View style={styles.switchItemContainer}>
                  <AppText style={styles.smallTextStyle}>Off</AppText>
                </View>
                <View style={styles.switchItemContainer}>
                  <AppSwitch
                    value={this.state.toggle_state === 0 ? true : false}
                    onValueChange={value =>
                      this.setState({ toggle_state: value ? 0 : 1 })
                    }
                  />
                </View>
                <View style={styles.switchItemContainer}>
                  <AppText style={styles.smallTextStyle}>On</AppText>
                </View>
              </View>
            ) : null}

            <View style={styles.rowContainer}>
              <AppText style={styles.smallTextStyle}>
                {object.states[this.state.toggle_state]}
              </AppText>
            </View>

            {showRemove ? (
              <View style={styles.rowContainer}>
                {/* Two buttons (Set and Remove). Not rounded in this screen. */}
                <TouchableOpacity
                  style={[
                    commonStyles.button,
                    { width: "40%", borderRadius: 0 }
                  ]}
                  onPress={this.onSubmit}
                >
                  <AppText
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    style={commonStyles.buttonText}
                  >
                    Set State
                  </AppText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    commonStyles.inverseButton,
                    { width: "40%", borderRadius: 0 }
                  ]}
                  onPress={this.onRemove}
                >
                  <AppText
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    style={commonStyles.inverseButtonText}
                  >
                    Remove
                  </AppText>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.rowContainer}>
                {/* One stretched button (Set). Not rounded in this screen. */}
                <TouchableOpacity
                  style={[
                    commonStyles.button,
                    { width: "90%", borderRadius: 0 }
                  ]}
                  onPress={this.onSubmit}
                >
                  <AppText style={commonStyles.buttonText}>Set State</AppText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={commonStyles.footer}>
          <AppText style={commonStyles.footerText}>
            {params.caller === "recipe"
              ? params.type === "causes"
                ? "Choose the Device state for this Recipe."
                : "Choose the Effects of this Recipe."
              : object.type === "area"
              ? "Choose the Mode of your system."
              : "Choose the Effects of this Mode."}
          </AppText>
        </View>

        <AppFooter ref="footer" />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 0,
    backgroundColor: "white"
  },
  titleContainer: {
    paddingTop: StyleSizes.TEXT_STD_SIZE * 2,
    paddingHorizontal: 16,
    alignItems: "center"
  },
  innerContainer: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8
  },
  rowContainer: {
    flexDirection: "row",
    paddingVertical: StyleSizes.TEXT_STD_SIZE / 2
  },
  textStyle: {
    fontSize: StyleSizes.TEXT_STD_SIZE,
    paddingVertical: 2
  },
  switchItemContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  smallTextStyle: {
    fontSize: StyleSizes.TEXT_STD_SIZE,
    paddingHorizontal: 16
  },
  iconImage: {
    width: Layout.window.height * 0.225,
    height: Layout.window.height * 0.225
  }
});
