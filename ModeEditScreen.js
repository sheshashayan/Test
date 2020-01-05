import React from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { connect } from "react-redux";

import backendGetAsync from "../api/backendGetAsync";
import { ThemeImage } from "../components/Theme";
import Colors from "../constants/Colors";
import Layout from "../constants/Layout";
import commonStyles from "../styles/CommonStyles";
import StyleSizes from "../styles/StyleSizes";
import { AppView } from "../components/AppFramework";
import { AppText, AppTitle } from "../components/StyledText";
import HeaderTitle from "../components/HeaderTitle";

// Make the circles fit the screen size
const CIRCLE_SIZE = Layout.window.width / 8;

// Help button
const INFO_ICON_SIZE = Layout.window.height * 0.042;

// Max animation scale
const MAX_ANIM_SCALE = 1.4;

// Empty mode object, as returned by modes/details API
const empty_mode = {
  id: 0,
  name: "",
  description: "",
  enabled: false,
  recipes: [], // Array of 15 empty objects
  effects: [] // Array of 10 empty objects
};

@connect(data => ModeEditScreen.getDataProps)
export default class ModeEditScreen extends React.Component {
  static navigationOptions = ({ navigation }) => ({
    headerTitle: (
      <HeaderTitle>
        {navigation.state.params.mode !== null
          ? AppTitle("Edit your Mode")
          : AppTitle("Create a Mode")}
      </HeaderTitle>
    ),
    headerRight: <View />
  });

  // Local state
  state = {
    mode: {},
    recipe_mask: [], // Array of 25 recipes, 0=Excluded, 1=Included
    animIndex: 0,
    animDirection: 0,
    animScale: new Animated.Value(1.0),
    activity_animating: false
  };

  // Redux store
  static getDataProps(data) {
    return {
      currentUser: data.currentUser,
      theme: data.currentUser.theme,
      panel: data.apiState.panel.data
    };
  }

  // Nav title (passed down to all sub-screens)
  getNavTitle() {
    return this.props.navigation.state.params.mode !== null
      ? AppTitle("Edit your Mode")
      : AppTitle("Create a Mode");
  }

  animateNext = direction => {
    const startValue = direction === 0 ? 0 : MAX_ANIM_SCALE;
    const endValue = direction === 0 ? MAX_ANIM_SCALE : 1.0;
    this.state.animScale.setValue(startValue);

    // Check we haven't unmounted before finished animation
    if (this._unmounted === true) {
      return;
    }

    // Move the animation on to the next stage
    Animated.timing(this.state.animScale, {
      toValue: endValue,
      duration: 30,
      easing: Easing.linear
    }).start(() => {
      // Stop callbacks once we've done all of the icons
      if (this.state.animIndex < 15) {
        if (direction === 0) {
          this.animateNext(1);
        } else {
          this.setState({ animIndex: this.state.animIndex + 1 }, () =>
            this.animateNext(0)
          );
        }
      }
    });
  };

  async componentWillMount() {
    this._unmounted = false;
    const params = this.props.navigation.state.params;

    // Fetch the list of affects
    this.setState({ activity_animating: true });
    const effects = await this.fetchEffects();
    this.setState({ activity_animating: false });
    if (effects !== null) {
      // Check we haven't unmounted while fetching
      if (this._unmounted === false) {
        // If an existing mode passed to edit, load its object into local state.
        // Otherwise it defaults to an empty mode object.
        if (params.mode !== null) {
          let mode = { ...params.mode };

          // Parse the recipe mask out of the passed mode.
          // Create an array of which of the 25 recipes are included/excluded.
          let recipe_mask = [];
          for (let i = 0; i < 25; i++) {
            recipe_mask[i] = mode.recipes[i];
          }

          // Also turn into local list of objects with icons.
          const recipe_count = recipe_mask.filter(x => x === 1).length;
          for (let i = 0; i < 15; i++) {
            mode.recipes[i] = i < recipe_count ? { icon: "recipes.png" } : {};
          }

          // Store the parsed mode details
          this.setState({ mode, effects, recipe_mask });
        } else {
          // Create a mode object with the index filled in with the first empty mode
          const new_mode = { ...empty_mode, id: params.next_free_index };
          for (var i = 0; i < 15; i++) {
            new_mode.recipes.push({});
          }
          new_mode.effects = [];
          for (var i = 0; i < 10; i++) {
            new_mode.effects.push({});
          }

          // Create an array of which of the 25 recipes are included/excluded.
          // Default all recipes excluded.
          let recipe_mask = [];
          for (var i = 0; i < 25; i++) {
            recipe_mask.push(0);
          }
          this.setState({ mode: new_mode, effects, recipe_mask });
        }

        // Start animation
        this.animateNext(0);
      }
    }
  }

  componentWillUnmount() {
    // Prevent setState() while unmounting
    this._unmounted = true;
  }

  fetchEffects = async () => {
    const effects = await backendGetAsync(
      `/api/texecom-app/recipes/effects?&panel_id=${this.props.panel.panel_id}`,
      this.props.currentUser.api_server,
      this.props.currentUser.api_token,
      null,
      null
    );
    if (effects === null) {
      // Failed to set in backend
      Alert.alert(
        AppTitle("Error"),
        AppTitle("Failed to retrieve causes & effects")
      );
      return null;
    } else {
      return effects;
    }
  };

  // Change recipe selection
  onChangeRecipes = recipe_mask => {
    // Modify the recipes icons to match the number of enabled recipes
    const recipe_count = recipe_mask.filter(x => x === 1).length;

    // Light up the icons
    let mode = { ...this.state.mode };
    for (let i = 0; i < 15; i++) {
      mode.recipes[i] = i < recipe_count ? { icon: "recipes.png" } : {};
    }

    // Store the new mode and remember the recipe_mask
    this.setState({ mode, recipe_mask });
  };

  // Add/change an effect entry
  onSelect = (type, index, choice) => {
    let mode = { ...this.state.mode };
    mode[type][index] = choice;
    console.log("onSelect state:" + JSON.stringify(choice.state));
    this.setState({ mode });
  };

  // Remove an effect entry
  onRemove = (type, index) => {
    let mode = { ...this.state.mode };
    mode[type][index] = {};
    this.setState({ mode });
  };

  onPressItem = (type, index) => {
    // Find out which is the first empty index
    first_empty = this.getFirstEmpty(this.state.mode[type]);

    // Handle the click
    if (type === "recipes") {
      // Open Recipes Picker to select list of recipes
      this.props.navigation.navigate("ModeRecipeList", {
        recipe_mask: this.state.recipe_mask,
        onChangeRecipes: this.onChangeRecipes
      });
    } else {
      // Effects: If first effect picked then offer the Arm mode
      if (index === 0 && this.isItemEmpty(this.state.mode[type][index])) {
        // Open Effect Picker to select new Effect
        this.props.navigation.navigate("ModeEffectArmMode", {
          mode: this.state.mode,
          caller: "mode",
          type,
          index,
          effects: this.state.effects,
          onSelect: this.onSelect,
          onRemove: null,
          navTitle: this.getNavTitle()
        });
      } else if (this.isItemEmpty(this.state.mode[type][index])) {
        // Effects: Open effects picker or edit existing
        // Open Effect Picker to select new Effect
        this.props.navigation.navigate("ModeEditEffectList", {
          mode: this.state.mode,
          caller: "mode",
          type,
          index,
          effects: this.state.effects,
          onSelect: this.onSelect,
          onRemove: null,
          navTitle: this.getNavTitle()
        });
      } else {
        // Allow user to change the state of the existing effect.
        // If it's the last effect, also allow them to remove it.
        const last_effect = index === first_empty - 1;
        const effect = this.state.mode[type][index];
        // Open state edit screen
        this.props.navigation.navigate("ChooseState", {
          caller: "mode",
          type,
          index,
          called_from_tabnav: false,
          onSelect: this.onSelect,
          onRemove: last_effect ? this.onRemove : null,
          object_to_change: effect,
          navTitle: this.getNavTitle()
        });
      }
    }
  };

  onSave = () => {
    console.log(`ModeEdit: onSave index ${this.state.mode.id}`);

    // Check we have at least one effect
    if (this.getFirstEmpty(this.state.mode.effects) === 0) {
      Alert.alert(
        AppTitle("Error"),
        AppTitle("You need to add at least 1 effect")
      );
    } else {
      // Create a mode object in the correct format for the save API
      const save_obj = { ...this.state.mode, recipes: this.state.recipe_mask };

      // Open Mode Name page passing in the mode and whether it's
      // a brand new or updating an existing one
      this.props.navigation.navigate("ModeName", {
        mode: save_obj,
        new_mode: this.props.navigation.state.params.mode === null,
        onSubmit: this.onSaved,
        navTitle: this.getNavTitle()
      });
    }
  };

  onSaved = () => {
    // On completed mode save, go back to modes list
    console.log(`ModeEdit: Successfully saved mode`);
    this.props.navigation.goBack();
  };

  // Get the icon for a cause or effect
  getIcon = (item, index, first_empty) => {
    if (index === first_empty) {
      return "recipenext-grey.png";
    } else if (typeof item.icon !== "undefined") {
      return item.icon;
    } else {
      return "recipeblank-grey.png";
    }
  };

  isItemEmpty(item) {
    return Object.keys(item).length === 0;
  }

  getFirstEmpty(list) {
    return list.findIndex(entry => this.isItemEmpty(entry));
  }

  renderRow = (type, list, start, end) => {
    // Find the first empty index
    first_empty = this.getFirstEmpty(list);

    //console.log("First empty: " + first_empty);
    //console.log(`List row: ${JSON.stringify(list.slice(start, end))}`);

    // Show all entries on this row. User may click on anything up to the
    // "+" icon for the next available slot, the later buttons are disabled.
    return (
      <View style={styles.circleRowContainer}>
        {list.slice(start, end).map((item, index) => (
          <View key={index} style={styles.circleIconContainer}>
            <TouchableWithoutFeedback
              disabled={start + index > first_empty}
              onPress={() => this.onPressItem(type, start + index)}
            >
              {this.state.animIndex >= start + index ? (
                <Animated.Image
                  source={ThemeImage(
                    this.props.theme,
                    this.getIcon(item, start + index, first_empty)
                  )}
                  style={[
                    styles.circleIconImage,
                    {
                      transform: [
                        {
                          scale:
                            this.state.animIndex === start + index
                              ? this.state.animScale
                              : 1
                        }
                      ]
                    }
                  ]}
                />
              ) : (
                <View />
              )}
            </TouchableWithoutFeedback>
          </View>
        ))}
      </View>
    );
  };

  render() {
    if (Object.keys(this.state.mode).length === 0)
      return (
        <AppView
          activity={this.state.activity_animating}
          activity_vertical_pad={64}
          setToastRef={ref => (this.toast_ref = ref)}
          style={styles.notFullWidthContainer}
        />
      );
    else
      return (
        <AppView
          activity={this.state.activity_animating}
          activity_vertical_pad={64}
          setToastRef={ref => (this.toast_ref = ref)}
          style={styles.notFullWidthContainer}
        >
          <View style={styles.headingContainer}>
            <View style={styles.headingLeftContainer}>
              <AppText style={styles.headingText}>Select Mode Recipes</AppText>
            </View>
            <View style={styles.headingRightContainer}>
              <TouchableHighlight
                style={styles.infoIconContainer}
                onPress={() =>
                  this.props.navigation.navigate("ModeEditHelp", {
                    navTitle: this.getNavTitle()
                  })
                }
              >
                <Image
                  source={ThemeImage(this.props.theme, "info.png")}
                  style={styles.infoIconImage}
                />
              </TouchableHighlight>
            </View>
          </View>
          {this.renderRow("recipes", this.state.mode.recipes, 0, 5)}
          {this.renderRow("recipes", this.state.mode.recipes, 5, 10)}
          {this.renderRow("recipes", this.state.mode.recipes, 10, 15)}

          <View style={styles.headingContainer}>
            <AppText style={styles.headingText}>Select Mode Effects</AppText>
          </View>
          {this.renderRow("effects", this.state.mode.effects, 0, 5)}
          {this.renderRow("effects", this.state.mode.effects, 5, 10)}

          <TouchableOpacity style={commonStyles.button} onPress={this.onSave}>
            <AppText style={commonStyles.buttonText}>
              {this.props.navigation.state.params.mode === null
                ? "Name Your Mode"
                : "Update Your Mode"}
            </AppText>
          </TouchableOpacity>
        </AppView>
      );
  }
}

const styles = StyleSheet.create({
  notFullWidthContainer: {
    flex: 1,
    paddingTop: 0,
    paddingHorizontal: 16,
    backgroundColor: "white"
  },
  headingContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomColor: Colors.headingBorderLine,
    borderBottomWidth: 2
  },
  headingLeftContainer: {
    flex: 2,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center" // Align text vertically
  },
  headingRightContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end"
  },
  headingText: {
    fontSize: StyleSizes.TEXT_SMALL_SIZE,
    fontWeight: "normal",
    color: "black"
  },
  infoIconContainer: {
    height: INFO_ICON_SIZE,
    width: INFO_ICON_SIZE,
    borderRadius: INFO_ICON_SIZE / 2
  },
  infoIconImage: {
    height: INFO_ICON_SIZE,
    width: INFO_ICON_SIZE,
    tintColor: "lightgray"
  },
  circleIconContainer: {
    height: CIRCLE_SIZE * MAX_ANIM_SCALE,
    width: CIRCLE_SIZE * MAX_ANIM_SCALE,
    alignItems: "center",
    justifyContent: "center"
  },
  circleIconImage: {
    height: CIRCLE_SIZE,
    width: CIRCLE_SIZE,
    resizeMode: "contain"
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1,
    borderColor: "lightgray",
    backgroundColor: "whitesmoke"
  },
  circleRowContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between"
  }
});
