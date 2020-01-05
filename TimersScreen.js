import React from "react";
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { connect } from "react-redux";
import Swipeable from "react-native-swipeable";

import backendGetAsync from "../api/backendGetAsync";
import { ThemeImage } from "../components/Theme";
import Layout from "../constants/Layout";
import { AppView } from "../components/AppFramework";
import { AppTitle, AppUnText } from "../components/StyledText";
import SwipeButton from "../components/SwipeButton";
import ListStyles from "../styles/ListStyles";

@connect(data => TimersScreen.getDataProps)
export default class TimersScreen extends React.Component {
  static navigationOptions = ({ navigation }) => ({
    title: `${AppTitle("Timers")}`
  });

  // Redux store
  static getDataProps(data) {
    return {
      currentUser: data.currentUser,
      theme: data.currentUser.theme,
      isLoggedIn: data.apiState.isLoggedIn,
      panel: data.apiState.panel.data
    };
  }

  state = {
    timer_list: [],
    currentlyOpenSwipeable: null,
    swipeInProgress: false,
    activity_animating: false
  };

  // Non-render state
  add_disabled = false;

  componentWillMount() {
    // Fetch the timer list
    this.fetchTimerList();
  }

  componentDidMount() {
    // Register with the parent tab navigator a handler for function called when top bar icon is pressed
    this.props.screenProps.registerHeaderRightClick("Timers", this.createTimer);
  }

  fetchTimerList = async () => {
    // Disable Add button while fetching
    this.add_disabled = true;

    // Fetch timer list (doesn't use read_live=1 because we assume the cloud is up-to-date,
    // if anyone has added a timer on another phone then a Panel Sync is required).
    this.setState({ activity_animating: true });
    const timer_list = await backendGetAsync(
      `/api/texecom-app/recipes/timers/list?&panel_id=${
        this.props.panel.panel_id
      }`,
      this.props.currentUser.api_server,
      this.props.currentUser.api_token,
      null,
      null
    );
    // If successful, set in local state to force render of timer list
    if (timer_list === null) {
      this.setState({ activity_animating: false });
      Alert.alert(AppTitle("Error"), AppTitle("Failed to fetch timer list"), {
        cancelable: false
      });
    } else {
      this.setState({ timer_list, activity_animating: false });
    }

    // Re-enable Add button after fetching
    this.add_disabled = false;
  };

  timerIsEmpty = timer => {
    // Empty timer entries have empty name, empty "from" objects or from.hours === 655
    return (
      timer.name === "" ||
      Object.keys(timer.from).length === 0 ||
      (typeof timer.from.hours !== "undefined" && timer.from.hours === 655)
    );
  };

  // Open Create Timer page
  createTimer = () => {
    // Check creation of timers is not disabled right now
    if (!this.add_disabled) {
      // Find the first empty timer entry (from.hours === 655)
      const first_empty = this.state.timer_list.findIndex(entry =>
        this.timerIsEmpty(entry)
      );

      // Check there are spare timers
      if (first_empty === -1) {
        Alert.alert(
          AppTitle("Error"),
          AppTitle("No spare timers, please remove one")
        );
      } else {
        // Navigate to the selected page. We pass null for the timer
        // because we're creating a new one not updating existing.
        // On completion refresh our timer list.
        this.props.navigation.navigate("TimerEdit", {
          timer: null,
          timer_index: first_empty,
          onSubmit: () => this.fetchTimerList()
        });
      }
    }
  };

  // Open Edit Timer page, passing the timer object.
  // On completion refresh our timer list.
  editTimer = (timer, timer_index) => {
    this.props.navigation.navigate("TimerEdit", {
      timer,
      timer_index,
      onSubmit: () => this.fetchTimerList()
    });
  };

  // Handle click on item
  _handleClick = (item, index) => {
    this.editTimer(item, index);
  };

  // Handle long-click / swipe delete on item
  _handleDelete = (timer, index) => {
    Alert.alert(
      AppTitle("Delete Timer"),
      AppTitle("Are You Sure You Want To Delete This Timer?"),
      [
        {
          text: AppTitle("No"),
          style: "cancel"
        },
        {
          text: AppTitle("Yes"),
          style: "destructive",
          onPress: () => this.deleteTimer(timer, index)
        }
      ],
      { cancelable: false }
    );
  };

  deleteTimer = async (timer, timer_index) => {
    // Start activity indicator
    this.setState({ activity_animating: true });

    // Delete the timer
    const deleted = await backendGetAsync(
      `/api/texecom-app/recipes/timers/delete?&panel_id=${
        this.props.panel.panel_id
      }&recipe_timer_number=${timer_index + 1}`,
      this.props.currentUser.api_server,
      this.props.currentUser.api_token,
      this.toast_ref,
      this.props.panel.panel_id
    );
    if (deleted === null) {
      // Failed to set in backend
      Alert.alert(AppTitle("Error"), AppTitle("remove_recipe_timer"));
    } else {
      // Successfully set in backend, fetch the new list
      await this.fetchTimerList();
    }

    // Stop activity indicator
    this.setState({ activity_animating: false });
  };

  // Swipeable component: recenter previously swiped rows on scrolling screen
  recentreSwipeable = () => {
    const { currentlyOpenSwipeable } = this.state;

    if (currentlyOpenSwipeable) {
      // Recenter swipeable
      currentlyOpenSwipeable.recenter();

      // No longer open
      this.setState({ currentlyOpenSwipeable: null });
    }
  };

  // Recenter previously swiped rows
  handleSwipeOpenRelease = swipeable => {
    if (
      this.state.currentlyOpenSwipeable &&
      this.state.currentlyOpenSwipeable !== swipeable
    ) {
      this.state.currentlyOpenSwipeable.recenter();
    }
    this.setState({
      currentlyOpenSwipeable: swipeable
    });
  };
  handleSwipeCloseRelease = () =>
    this.setState({ currentlyOpenSwipeable: null });

  // Use timer index as key for FlatList
  _keyExtractor = (item, index) => index.toString();

  // Render each timer row
  _renderRow = ({ item, index }) => {
    // Don't render empty timers
    if (this.timerIsEmpty(item)) {
      return <View key={index} />;
    } else
      return (
        <View key={index} style={ListStyles.listEntryBorderContainer}>
          <Swipeable
            rightButtons={[
              SwipeButton("Delete", "red", () =>
                this._handleDelete(item, index)
              )
            ]}
            rightActionActivationDistance={Layout.window.width / 2}
            onRightActionRelease={() => this._handleDelete(item, index)}
            onRef={ref => (this.swipeable = ref)}
            onRightButtonsOpenRelease={(event, gestureState, swipeable) =>
              this.handleSwipeOpenRelease(swipeable)
            }
            onRightButtonsCloseRelease={() => this.handleSwipeCloseRelease()}
            onSwipeStart={() => this.setState({ swipeInProgress: true })}
            onSwipeRelease={() => this.setState({ swipeInProgress: false })}
          >
            <TouchableWithoutFeedback
              onPress={() => this._handleClick(item, index)}
              onLongPress={() => this._handleDelete(item, index)}
            >
              <View style={ListStyles.listEntryMainContainer}>
                <View style={ListStyles.listEntryLeftContainer}>
                  <Image
                    source={ThemeImage(this.props.theme, "time.png")}
                    style={ListStyles.listEntryImage}
                  />
                  <View style={ListStyles.listEntryTextContainerMultiline}>
                    <AppUnText
                      numberOfLines={1}
                      adjustsFontSizeToFit={true}
                      style={ListStyles.listEntryText}
                    >
                      {item.name !== "" ? item.name : AppTitle("Unnamed Timer")}
                    </AppUnText>
                    {item.description !== "" ? (
                      <AppUnText
                        numberOfLines={1}
                        adjustsFontSizeToFit={true}
                        style={ListStyles.listEntrySubtext}
                      >
                        {item.description}
                      </AppUnText>
                    ) : null}
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </Swipeable>
        </View>
      );
  };

  render() {
    return (
      <AppView
        activity={this.state.activity_animating}
        setToastRef={ref => (this.toast_ref = ref)}
        style={styles.container}
      >
        <FlatList
          data={this.state.timer_list}
          keyExtractor={this._keyExtractor}
          renderItem={this._renderRow}
          removeClippedSubviews={false}
          scrollEnabled={!this.state.swipeInProgress}
        />
      </AppView>
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
