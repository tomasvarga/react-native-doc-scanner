/* eslint-disable no-underscore-dangle */
import React, { Component } from 'react'
import {
  NativeModules,
  PanResponder,
  Dimensions,
  Image,
  View,
  Animated,
  ActivityIndicator,
  Platform,
} from 'react-native'
import PropTypes from 'prop-types'
import Svg, { Polygon } from 'react-native-svg'
import ImageSize from 'react-native-image-size'

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon)

const TOP = 0
const RIGHT = 1
const BOTTOM = 2
const LEFT = 3

const HORIZONTAL_PADDING = 15

class DocScanner extends Component {
  state = {
    isLoading: true,
  }
  constructor(props) {
    super(props)

    const corners = []
    for (let i = 0; i < 4; i++) {
      corners[i] = { position: new Animated.ValueXY(), delta: { x: 0, y: 0 } }
      corners[i].panResponder = this.cornerPanResponser(corners[i])
    }

    const midPoints = []
    for (let i = 0; i < 4; i++) {
      midPoints[i] = {
        position: new Animated.ValueXY(),
        delta: { x: 0, y: 0 },
      }
      midPoints[i].panResponder = this.midPointPanResponser(midPoints[i], i)
    }

    this.state = {
      imageUri: props.initialImage,
      corners,
      midPoints,
      isLoading: true,
      zoom: 1,
    }
  }
  componentDidMount = async () => {
    const { imageUri } = this.state
    if (imageUri) {
      ImageSize.getSize(imageUri).then(({ height, width }) => {
        let newWidth = width
        let newHeight = height
        if (height <= width && Platform.OS === 'android') {
          newWidth = height
          newHeight = width
        }
        this.setState({
          imageWidth: newWidth,
          imageHeight: newHeight,
          viewWidth: newWidth,
          viewHeight: newHeight,
          imageLayoutWidth: newWidth,
          imageLayoutHeight: newHeight,
        })
      })
    }
  }
  onLayout = (event) => {
    const { layout } = event.nativeEvent
    const { imageHeight, corners, viewWidth, viewHeight } = this.state

    if (layout.width === viewWidth && layout.height === viewHeight) {
      return
    }

    const { defaultFrameCoordinates } = this.props
    const zoom = layout.height / imageHeight
    corners[0].position.setValue({
      x: defaultFrameCoordinates.left,
      y: defaultFrameCoordinates.top,
    })
    corners[1].position.setValue({
      x: defaultFrameCoordinates.right,
      y: defaultFrameCoordinates.top,
    })
    corners[2].position.setValue({
      x: defaultFrameCoordinates.left,
      y: defaultFrameCoordinates.bottom,
    })
    corners[3].position.setValue({
      x: defaultFrameCoordinates.right,
      y: defaultFrameCoordinates.bottom,
    })

    this.updateMidPoints()

    this.findDocument()

    this.setState({
      isLoading: false,
      viewWidth: layout.width,
      viewHeight: layout.height,
      imageLayoutWidth: layout.width,
      imageLayoutHeight: layout.height,
      offsetVerticle: 0,
      offsetHorizontal: 0,
      zoom,
      overlayPositions: this.getOverlayString(),
    })
  }
  cornerPanResponser = (corner) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (e, gesture) => {
        this.moveCorner(corner, gesture.dx, gesture.dy)
        this.setState({ overlayPositions: this.getOverlayString() })
      },
      onPanResponderRelease: () => {
        corner.delta = { x: 0, y: 0 }
      },
      onPanResponderGrant: () => {
        corner.delta = { x: 0, y: 0 }
      },
    })
  }
  moveCorner = (corner, dx, dy) => {
    const { imageLayoutWidth, imageLayoutHeight } = this.state
    const { delta, position } = corner
    position.setValue({
      x: Math.min(Math.max(position.x._value + dx - delta.x, 0), imageLayoutWidth),
      y: Math.min(Math.max(position.y._value + dy - delta.y, 0), imageLayoutHeight),
    })
    corner.delta = { x: dx, y: dy }
    this.updateMidPoints()
  }
  midPointPanResponser = (midPoint, side) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (e, gesture) => {
        const { topLeft, topRight, bottomLeft, bottomRight } = this.getCorners()
        switch (side) {
          case TOP:
            this.moveCorner(topLeft, 0, gesture.dy)
            this.moveCorner(topRight, 0, gesture.dy)
            break
          case RIGHT:
            this.moveCorner(bottomRight, gesture.dx, 0)
            this.moveCorner(topRight, gesture.dx, 0)
            break
          case BOTTOM:
            this.moveCorner(bottomLeft, 0, gesture.dy)
            this.moveCorner(bottomRight, 0, gesture.dy)
            break
          case LEFT:
            this.moveCorner(bottomLeft, gesture.dx, 0)
            this.moveCorner(topLeft, gesture.dx, 0)
            break
          default:
            break
        }
        this.setState({ overlayPositions: this.getOverlayString() })
      },
      onPanResponderRelease: () => {
        this.setState((state) => ({
          ...state,
          corners: state.corners.map((corner) => ({ ...corner, delta: { x: 0, y: 0 } })),
        }))
      },
      onPanResponderGrant: () => {},
    })
  }
  crop = () => {
    const { isLoading, imageUri, imageHeight, imageWidth } = this.state
    const { updateImage } = this.props
    if (!isLoading) {
      const { topLeft, topRight, bottomLeft, bottomRight } = this.getCorners()
      const coordinates = {
        topLeft: this.viewCoordinatesToImageCoordinates(topLeft),
        topRight: this.viewCoordinatesToImageCoordinates(topRight),
        bottomLeft: this.viewCoordinatesToImageCoordinates(bottomLeft),
        bottomRight: this.viewCoordinatesToImageCoordinates(bottomRight),
        height: imageHeight,
        width: imageWidth,
      }
      NativeModules.CustomCropManager.crop(coordinates, imageUri, (err, res) =>
        updateImage(res.image, coordinates)
      )
    }
  }
  findDocument = () => {
    const { imageUri } = this.state
    NativeModules.CustomCropManager.findDocument(imageUri, (err, res) => {
      const { corners, zoom, imageWidth, viewWidth } = this.state
      if (res) {
        const offsetHorizontal = Math.round((imageWidth * zoom - viewWidth) / 2)
        corners[0].position.setValue({
          x: res.topLeft.x * zoom - offsetHorizontal,
          y: res.topLeft.y * zoom,
        })
        corners[1].position.setValue({
          x: res.topRight.x * zoom - offsetHorizontal,
          y: res.topRight.y * zoom,
        })
        corners[2].position.setValue({
          x: res.bottomLeft.x * zoom - offsetHorizontal,
          y: res.bottomLeft.y * zoom,
        })
        corners[3].position.setValue({
          x: res.bottomRight.x * zoom - offsetHorizontal,
          y: res.bottomRight.y * zoom,
        })
        this.updateMidPoints()
      }
      this.setState({ isLoading: false, overlayPositions: this.getOverlayString(), corners })
    })
  }
  getCorners = () => {
    const { corners } = this.state
    const topSorted = [...corners].sort((a, b) => a.position.y._value > b.position.y._value)
    const topLeft =
      topSorted[0].position.x._value < topSorted[1].position.x._value ? topSorted[0] : topSorted[1]
    const topRight =
      topSorted[0].position.x._value >= topSorted[1].position.x._value ? topSorted[0] : topSorted[1]
    const bottomLeft =
      topSorted[2].position.x._value < topSorted[3].position.x._value ? topSorted[2] : topSorted[3]
    const bottomRight =
      topSorted[2].position.x._value >= topSorted[3].position.x._value ? topSorted[2] : topSorted[3]
    return { topLeft, topRight, bottomLeft, bottomRight }
  }
  setMidPoint = (point, start, end) => {
    point.position.setValue({
      x: (start.position.x._value + end.position.x._value) / 2,
      y: (start.position.y._value + end.position.y._value) / 2,
    })
  }
  updateMidPoints = () => {
    const { topLeft, topRight, bottomLeft, bottomRight } = this.getCorners()
    const { midPoints } = this.state
    this.setMidPoint(midPoints[TOP], topLeft, topRight)
    this.setMidPoint(midPoints[RIGHT], bottomRight, topRight)
    this.setMidPoint(midPoints[BOTTOM], bottomRight, bottomLeft)
    this.setMidPoint(midPoints[LEFT], topLeft, bottomLeft)
  }
  getOverlayString = () => {
    const { topLeft, topRight, bottomLeft, bottomRight } = this.getCorners()
    return `${topLeft.position.x._value},${topLeft.position.y._value}
            ${topRight.position.x._value},${topRight.position.y._value}
            ${bottomRight.position.x._value},${bottomRight.position.y._value}
            ${bottomLeft.position.x._value},${bottomLeft.position.y._value}`
  }
  offset = (position) => ({
    x: position.x._value + position.x._offset,
    y: position.y._value + position.y._offset,
  })
  viewCoordinatesToImageCoordinates = (corner) => {
    const { zoom, imageWidth, viewWidth } = this.state
    const offsetHorizontal =
      Platform.OS === 'android' ? Math.round((imageWidth * zoom - viewWidth) / (zoom * 2)) : 0
    return {
      x: corner.position.x._value / zoom + offsetHorizontal,
      y: corner.position.y._value / zoom,
    }
  }
  render() {
    const {
      offsetVerticle,
      offsetHorizontal,
      corners,
      midPoints,
      overlayPositions,
      isLoading,
      imageUri,
      viewHeight,
    } = this.state
    const {
      overlayColor,
      overlayStrokeWidth,
      overlayOpacity,
      overlayStrokeColor,
      loadingIndicatorColor,
    } = this.props
    return (
      <View style={{ flex: 1, width: '100%' }} onLayout={this.onLayout}>
        <Image style={{ flex: 1, width: '100%' }} resizeMode="cover" source={{ uri: imageUri }} />
        {isLoading && (
          <View
            style={{
              position: 'absolute',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              height: '100%',
            }}
          >
            <ActivityIndicator color={loadingIndicatorColor} size="large" />
          </View>
        )}
        {!isLoading && (
          <>
            <View
              style={{
                position: 'absolute',
                top: offsetVerticle,
                bottom: offsetVerticle,
                left: offsetHorizontal,
                right: offsetHorizontal,
              }}
            >
              <Svg
                height={viewHeight}
                width={Dimensions.get('window').width}
                style={{ position: 'absolute', left: 0, top: 0 }}
              >
                <AnimatedPolygon
                  ref={(ref) => {
                    this.polygon = ref
                  }}
                  fill={overlayColor}
                  fillOpacity={overlayOpacity}
                  stroke={overlayStrokeColor}
                  points={overlayPositions}
                  strokeWidth={overlayStrokeWidth}
                />
              </Svg>

              {midPoints.map((point, index) => (
                <Animated.View
                  key={`point-${index}`}
                  {...point.panResponder.panHandlers}
                  style={[point.position.getLayout(), s(this.props).handler]}
                >
                  <View
                    style={[
                      index === TOP || index === BOTTOM
                        ? s(this.props).handleMidHorizontal
                        : s(this.props).handleMidVertical,
                    ]}
                  />
                </Animated.View>
              ))}

              {corners.map((corner, index) => (
                <Animated.View
                  key={`corner-${index}`}
                  {...corner.panResponder.panHandlers}
                  style={[corner.position.getLayout(), s(this.props).handler]}
                >
                  <View style={[s(this.props).handlerRound]} />
                </Animated.View>
              ))}
            </View>
          </>
        )}
      </View>
    )
  }
}

const s = (props) => ({
  handlerRound: {
    width: 20,
    position: 'absolute',
    height: 20,
    borderRadius: 10,
    backgroundColor: props.handlerBackroundColor,
    borderColor: props.handlerBorderColor,
    borderWidth: 2,
  },
  handleMidHorizontal: {
    width: 40,
    position: 'absolute',
    height: 15,
    borderRadius: 10,
    backgroundColor: props.handlerBackroundColor,
    borderColor: props.handlerBorderColor,
    borderWidth: 2,
  },
  handleMidVertical: {
    width: 15,
    position: 'absolute',
    height: 40,
    borderRadius: 10,
    backgroundColor: props.handlerBackroundColor,
    borderColor: props.handlerBorderColor,
    borderWidth: 2,
  },
  handler: {
    height: 60,
    width: 60,
    marginLeft: -30,
    marginTop: -30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    backgroundColor: 'transparent',
    borderRadius: 50,
  },
})

DocScanner.defaultProps = {
  handlerBackroundColor: 'white',
  handlerBorderColor: 'blue',
  overlayColor: 'blue',
  overlayStrokeWidth: 3,
  overlayOpacity: 0.5,
  overlayStrokeColor: 'blue',
  loadingIndicatorColor: 'blue',
  defaultFrameCoordinates: {
    left: HORIZONTAL_PADDING,
    right: Dimensions.get('window').width - HORIZONTAL_PADDING,
    bottom: Dimensions.get('window').height - 100,
    top: 100,
  },
}

DocScanner.propTypes = {
  handlerBackroundColor: PropTypes.string,
  handlerBorderColor: PropTypes.string,
  overlayColor: PropTypes.string,
  overlayStrokeWidth: PropTypes.number,
  overlayOpacity: PropTypes.number,
  overlayStrokeColor: PropTypes.string,
  loadingIndicatorColor: PropTypes.string,
  updateImage: PropTypes.func,
  defaultFrameCoordinates: PropTypes.shape({
    left: PropTypes.number,
    right: PropTypes.number,
    bottom: PropTypes.number,
    top: PropTypes.number,
  }),
  initialImage: PropTypes.string,
}

export default DocScanner
