// @flow

import React, {Component} from 'react'
import {
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  Platform,
  Animated
} from 'react-native'
import {styles, top, bottom} from './styles.js'
import FAIcon from 'react-native-vector-icons/MaterialIcons'
import * as UTILS from '../../../utils.js'
import {bns} from 'biggystring'
import * as Constants from '../../../../constants/indexConstants'
import {intl} from '../../../../locales/intl'

export type FlipInputFieldInfo = {
  currencyName: string,
  currencySymbol: string,  // currency symbol of field
  currencyCode: string, // 3-5 digit currency code
  maxEntryDecimals: number, // Maximum number of decimals to allow the user to enter
  maxConversionDecimals: number, // Maximum number of decimals to convert from the opposite field to this field
}

type State = {
  isToggled: boolean,
  textInputFrontFocus: boolean,
  textInputBackFocus: boolean,
  overridePrimaryDecimalAmount: string,
  primaryDisplayAmount: string, // Actual display amount including 1000s separator and localized for region
  secondaryDisplayAmount: string // Actual display amount including 1000s separator and localized for region
}

export type FlipInputOwnProps = {
  overridePrimaryDecimalAmount: string, // override value of field
  exchangeSecondaryToPrimaryRatio: string,
  primaryInfo: FlipInputFieldInfo,
  secondaryInfo: FlipInputFieldInfo,
  onAmountChanged(decimalAmount: string): void, // Callback when primaryDecimalAmount changes. This is NOT called when the prop displayAmount is changed
}

type Props = FlipInputOwnProps

// Assumes a US locale decimal input
function setPrimaryToSecondary (props: Props, primaryDecimalAmount: string) {
  // Formats into locale specific format
  const primaryDisplayAmount = intl.formatNumberInput(primaryDecimalAmount)

  // Converts to secondary value using exchange rate
  let secondaryDecimalAmount = bns.mul(primaryDecimalAmount, props.exchangeSecondaryToPrimaryRatio)

  // Truncate to however many decimals the secondary format should have
  secondaryDecimalAmount = UTILS.truncateDecimals(secondaryDecimalAmount, props.secondaryInfo.maxConversionDecimals)

  // Format into locale specific format
  const secondaryDisplayAmount = intl.formatNumberInput(secondaryDecimalAmount)

  // Set the state for display in render()
  return {primaryDisplayAmount, secondaryDisplayAmount}
}

// Pretty much the same as setPrimaryToSecondary
function setSecondaryToPrimary (props: Props, secondaryDecimalAmount: string) {
  const secondaryDisplayAmount = intl.formatNumberInput(secondaryDecimalAmount)
  let primaryDecimalAmount = bns.div(secondaryDecimalAmount, props.exchangeSecondaryToPrimaryRatio, 18)
  primaryDecimalAmount = UTILS.truncateDecimals(primaryDecimalAmount, props.primaryInfo.maxConversionDecimals)
  const primaryDisplayAmount = intl.formatNumberInput(primaryDecimalAmount)
  return {secondaryDisplayAmount, primaryDisplayAmount, primaryDecimalAmount}
}

const getInitialState = (props: Props) => {
  const state: State = {
    isToggled: false,
    textInputFrontFocus: false,
    textInputBackFocus: false,
    overridePrimaryDecimalAmount: '',
    primaryDisplayAmount: '',
    secondaryDisplayAmount: ''
  }

  let stateAmounts = {}
  if (props.overridePrimaryDecimalAmount !== '') {
    const primaryDecimalAmount = UTILS.truncateDecimals(props.overridePrimaryDecimalAmount, props.primaryInfo.maxEntryDecimals)
    stateAmounts = setPrimaryToSecondary(props, primaryDecimalAmount)
  }
  const newState = Object.assign(state, stateAmounts)
  return newState
}

export class FlipInput extends Component<FlipInputOwnProps, State> {
  animatedValue: Animated.Value
  frontInterpolate: Animated.Value
  backInterpolate: Animated.Value
  androidFrontOpacityInterpolate: Animated.Value
  androidBackOpacityInterpolate: Animated.Value
  textInputFront: TextInput
  textInputBack: TextInput

  constructor (props: Props) {
    super(props)
    this.state = getInitialState(props)
  }
  onToggleFlipInput = () => {
    this.setState({
      isToggled: !this.state.isToggled
    })
    if (this.state.isToggled) {
      if (this.state.textInputBackFocus) {
        this.textInputFront.focus()
      }
      Animated.spring(this.animatedValue, {
        toValue: 0,
        friction: 8,
        tension: 10
      }).start()
    }
    if (!this.state.isToggled) {
      if (this.state.textInputFrontFocus) {
        this.textInputBack.focus()
      }
      Animated.spring(this.animatedValue, {
        toValue: 1,
        friction: 8,
        tension: 10
      }).start()
    }
  }
  componentWillMount () {
    this.animatedValue = new Animated.Value(0)
    this.frontInterpolate = this.animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '180deg']
    })

    this.backInterpolate = this.animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['180deg', '360deg']
    })
    this.androidFrontOpacityInterpolate = this.animatedValue.interpolate({
      inputRange: [0, 0.5, 0.5],
      outputRange: [1, 1, 0]
    })
    this.androidBackOpacityInterpolate = this.animatedValue.interpolate({
      inputRange: [0.5, 0.5, 1],
      outputRange: [0, 1, 1]
    })
  }

  componentWillReceiveProps (nextProps: Props) {
    // Check if primary changed first. Don't bother to check secondary if parent passed in a primary
    if (nextProps.overridePrimaryDecimalAmount !== this.state.overridePrimaryDecimalAmount) {
      const primaryDecimalAmount = UTILS.truncateDecimals(nextProps.overridePrimaryDecimalAmount, nextProps.primaryInfo.maxEntryDecimals)
      this.setState(setPrimaryToSecondary(nextProps, primaryDecimalAmount))
      this.setState({overridePrimaryDecimalAmount: nextProps.overridePrimaryDecimalAmount})
    } else {
      if (!this.state.isToggled) {
        const decimalAmount = intl.formatToNativeNumber(this.state.primaryDisplayAmount)
        this.setState(setPrimaryToSecondary(nextProps, decimalAmount))
      } else {
        const decimalAmount = intl.formatToNativeNumber(this.state.secondaryDisplayAmount)
        const newState = setSecondaryToPrimary(nextProps, decimalAmount)
        this.setState({
          primaryDisplayAmount: newState.primaryDisplayAmount,
          secondaryDisplayAmount: newState.secondaryDisplayAmount
        })
      }
    }
  }

  onPrimaryAmountChange = (displayAmount: string) => {
    if (!intl.isValidInput(displayAmount)) {
      return
    }
    // Do any necessary formatting of the display value such as truncating decimals
    const formattedDisplayAmount = intl.truncateDecimals(intl.prettifyNumber(displayAmount), this.props.primaryInfo.maxEntryDecimals)

    // Format to standard US decimals with no 1000s separator. This is what we return to the parent view in the callback
    const decimalAmount = intl.formatToNativeNumber(formattedDisplayAmount)

    const result = setPrimaryToSecondary(this.props, decimalAmount)
    this.setState(
      result,
      () => {
        this.props.onAmountChanged(decimalAmount)
      }
    )
  }

  onSecondaryAmountChange = (displayAmount: string) => {
    if (!intl.isValidInput(displayAmount)) {
      return
    }
    // Do any necessary formatting of the display value such as truncating decimals
    const formattedDisplayAmount = intl.truncateDecimals(intl.prettifyNumber(displayAmount), this.props.secondaryInfo.maxEntryDecimals)

    // Format to standard US decimals with no 1000s separator. This is what we return to the parent view in the callback
    const decimalAmount = intl.formatToNativeNumber(formattedDisplayAmount)

    const result = setSecondaryToPrimary(this.props, decimalAmount)
    this.setState(
      {
        primaryDisplayAmount: result.primaryDisplayAmount,
        secondaryDisplayAmount: result.secondaryDisplayAmount
      },
      () => {
        this.props.onAmountChanged(result.primaryDisplayAmount)
      }
    )
  }

  topRowFront = (fieldInfo: FlipInputFieldInfo, onChangeText: ((string) => void), amount: string) => {
    return (
      <View style={top.row} key={'top'}>
        <Text style={[top.symbol]}>
          {fieldInfo.currencySymbol}
        </Text>
        <TextInput style={[top.amount, (Platform.OS === 'ios') ? {} : {paddingBottom: 2}]}
          placeholder={'0'}
          placeholderTextColor={'rgba(255, 255, 255, 0.60)'}
          value={amount}
          onChangeText={onChangeText}
          autoCorrect={false}
          keyboardType='numeric'
          selectionColor='white'
          returnKeyType='done'
          underlineColorAndroid={'transparent'}
          ref={ (ref) => { this.textInputFront = ref } }
          onFocus={ () => this.setState({ textInputFrontFocus: true }) }
          onBlur={ () => this.setState({ textInputFrontFocus: false }) }
        />
        <Text style={[top.currencyCode]}>
          {fieldInfo.currencyName}
        </Text>
      </View>
    )
  }

  topRowBack = (fieldInfo: FlipInputFieldInfo, onChangeText: ((string) => void), amount: string) => {
    return (
      <View style={top.row} key={'top'}>
        <Text style={[top.symbol]}>
          {fieldInfo.currencySymbol}
        </Text>
        <TextInput style={[top.amount, (Platform.OS === 'ios') ? {} : {paddingBottom: 2}]}
          placeholder={'0'}
          placeholderTextColor={'rgba(255, 255, 255, 0.60)'}
          value={amount}
          onChangeText={onChangeText}
          autoCorrect={false}
          keyboardType='numeric'
          selectionColor='white'
          returnKeyType='done'
          underlineColorAndroid={'transparent'}
          ref={ (ref) => { this.textInputBack = ref } }
          onFocus={ () => this.setState({ textInputBackFocus: true }) }
          onBlur={ () => this.setState({ textInputBackFocus: false }) }
        />
        <Text style={[top.currencyCode]}>
          {fieldInfo.currencyName}
        </Text>
      </View>
    )
  }

  bottomRow = (fieldInfo: FlipInputFieldInfo, amount: string) => {
    return (
      <TouchableWithoutFeedback onPress={this.onToggleFlipInput} key={'bottom'}>
        <View style={bottom.row}>
          <Text style={[bottom.symbol]}>
            {fieldInfo.currencySymbol}
          </Text>
          <Text style={[
            bottom.amount,
            !amount && bottom.alert
          ]}>
          {amount || '0'}
        </Text>
        <Text style={[bottom.currencyCode]}>
          {fieldInfo.currencyName}
        </Text>
      </View>
    </TouchableWithoutFeedback>
    )
  }

  render () {
    const {primaryInfo, secondaryInfo} = this.props
    const {isToggled} = this.state
    const frontAnimatedStyle = {
      transform: [
        { rotateX: this.frontInterpolate }
      ]
    }
    const backAnimatedStyle = {
      transform: [
        { rotateX: this.backInterpolate }
      ]
    }
    return (
      <View style={[styles.container]}>
        <Animated.View
          style={[styles.flipContainerFront, frontAnimatedStyle, {opacity: this.androidFrontOpacityInterpolate}]}
          pointerEvents={isToggled ? 'none' : 'auto'}
        >
          <View style={styles.flipButton}>
            <FAIcon style={[styles.flipIcon]} onPress={this.onToggleFlipInput} name={Constants.SWAP_VERT} size={36} />
          </View>
          <View style={[styles.rows]}>
            {this.topRowFront(primaryInfo, this.onPrimaryAmountChange, this.state.primaryDisplayAmount)}
            {this.bottomRow(secondaryInfo, this.state.secondaryDisplayAmount)}
          </View>
          <View style={styles.spacer} />
        </Animated.View>
        <Animated.View
          style={[styles.flipContainerFront, styles.flipContainerBack, backAnimatedStyle, {opacity: this.androidBackOpacityInterpolate}]}
          pointerEvents={isToggled ? 'auto' : 'none'}
        >
          <View style={styles.flipButton}>
            <FAIcon style={[styles.flipIcon]} onPress={this.onToggleFlipInput} name={Constants.SWAP_VERT} size={36} />
          </View>
          <View style={[styles.rows]}>
            {this.topRowBack(secondaryInfo, this.onSecondaryAmountChange, this.state.secondaryDisplayAmount)}
            {this.bottomRow(primaryInfo, this.state.primaryDisplayAmount)}
          </View>
          <View style={styles.spacer} />
        </Animated.View>
      </View>
    )
  }
}
