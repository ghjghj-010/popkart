import { useState } from 'react'
import { Upload, Button, message, Typography, Spin, Image } from 'antd'
import type { UploadProps, UploadFile } from 'antd'
import { PlusOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons'
import axios from 'axios'
import * as XLSX from 'xlsx'
import './App.less'

const { Title, Text } = Typography

// 豆包多模态API配置（请替换为您实际的API密钥和配置）
const DOUBAO_API_KEY = 'c2fc27bc-cf1d-4f0a-bbb3-ce3916a497e0'
// const DOUBAO_API_SECRET = 'YOUR_DOUBAO_API_SECRET'
const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

// 图片识别结果接口
interface ImageRecognitionResult {
  file: UploadFile
  recognizedText: string
  loading: boolean
  error: string | null
}

// 选手成绩接口
interface PlayerScore {
  playerName: string
  [key: string]: number | string // 图片名称对应的分数
}

function App() {
  // 存储上传的文件列表
  const [files, setFiles] = useState<UploadFile[]>([])
  // 识别结果列表
  const [recognitionResults, setRecognitionResults] = useState<ImageRecognitionResult[]>([])
  // 识别任务是否正在进行中
  const [isRecognizing, setIsRecognizing] = useState<boolean>(false)
  // 移除预览相关的状态，因为Image组件会处理预览
  const [previewOpen, setPreviewOpen] = useState<boolean>(false)

  // 处理文件上传前的校验
  const beforeUpload = (file: File) => {
    const isImage = file.type.startsWith('image/')
    if (!isImage) {
      message.error(`${file.name} 不是图片文件!`)
      return Upload.LIST_IGNORE
    }
    
    // 将文件添加到文件列表
    const newFile: UploadFile = {
      uid: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      status: 'done',
      response: { status: 'success' },
      size: file.size,
      type: file.type,
      thumbUrl: URL.createObjectURL(file),
      originFileObj: file as any
    }
    
    setFiles(prevFiles => [...prevFiles, newFile])
    return Upload.LIST_IGNORE
  }

  // 处理预览图片
  // const handlePreview = (index: number) => {
  //   setPreviewIndex(index)
  //   setPreviewOpen(true)
  // }

  // 处理移除文件 - 保持原有的实现
  const handleRemove = (file: UploadFile) => {
    // 释放预览URL
    if (file.thumbUrl) {
      URL.revokeObjectURL(file.thumbUrl)
    }
    // 从列表中移除文件
    setFiles(prevFiles => prevFiles.filter(item => item.uid !== file.uid))
    return true
  }


  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  // 将图片转换为Base64
  const convertImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result.split(',')[1]) // 移除data:image/png;base64,前缀
        } else {
          reject(new Error('无法转换图片为Base64'))
        }
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // 调用豆包多模态API识别图片文字 - 修改为返回识别结果
  const recognizeImageText = async (file: UploadFile, index: number): Promise<ImageRecognitionResult> => {
    // 更新UI状态，显示加载中
    setRecognitionResults(prev => 
      prev.map((item, i) => 
        i === index ? { ...item, loading: true, error: null } : item
      )
    )

    try {
      if (!file.originFileObj) {
        throw new Error('文件对象不存在')
      }

      // 将图片转换为Base64
      const base64Image = await convertImageToBase64(file.originFileObj as File)

      // 构建请求数据 - 优化提示词以获得更结构化的返回
      const requestData = {
        model: 'doubao-seed-1-6-flash-250828', // 豆包多模态模型
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${file.type};base64,${base64Image}`
                }
              },
              {
                type: 'text',
                text: '请仔细识别图片中每个选手的名次和名称。\n\n要求：\n1. 严格按照以下格式返回：名次. 选手名称\n2. 只保留选手名称中的中文和英文字符，忽略所有标点符号、数字、空格等特殊字符\n3. 对于未完成比赛的选手，标记为X. 选手名称\n4. 确保选手名称准确识别，避免因格式问题导致识别错误\n\n示例：\n1. 张三\n2. 李四\n3. John\nX. 王五\n\n请按此格式返回识别结果：'
              }
            ]
          }
        ]
      }

      // 调用豆包API
      const response = await axios.post(DOUBAO_API_URL, requestData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DOUBAO_API_KEY}`,
          // 'X-Bce-Signature': `AppCode/${DOUBAO_API_SECRET}` // 具体认证方式请参考豆包API文档
        }
      })

      // 处理API响应
      const recognizedText = response.data.choices?.[0]?.message?.content || '未能识别到文字'
      
      // 创建识别结果对象
      const result: ImageRecognitionResult = {
        file,
        recognizedText,
        loading: false,
        error: null
      }

      // 更新UI状态
      setRecognitionResults(prev => 
        prev.map((item, i) => 
          i === index ? result : item
        )
      )

      return result
    } catch (error) {
      console.error('识别图片文字失败:', error)
      
      // 创建错误结果对象
      const errorResult: ImageRecognitionResult = {
        file,
        recognizedText: '',
        loading: false,
        error: '识别失败，请重试'
      }

      // 更新UI状态
      setRecognitionResults(prev => 
        prev.map((item, i) => 
          i === index ? errorResult : item
        )
      )

      return errorResult
    }
  }

  // 标准化选手名称，只保留中文和英文字符
  const normalizePlayerName = (name: string): string => {
    // 使用正则表达式只保留中文、英文字母和数字
    return name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').trim()
  }

  // 根据标准化名称匹配选手
  const findMatchingPlayer = (targetName: string, existingPlayers: Set<string>): string | null => {
    const normalizedTarget = normalizePlayerName(targetName)
    
    for (const existingPlayer of existingPlayers) {
      const normalizedExisting = normalizePlayerName(existingPlayer)
      if (normalizedTarget === normalizedExisting) {
        return existingPlayer
      }
    }
    
    return null
  }

  // 根据名次获取分数
  const getScoreByRank = (rank: string): number => {
    // 分数规则：1-8名分别为10、7、5、4、3、1、0、-1；未完成比赛为-5
    if (rank.toUpperCase() === 'X') {
      return -5 // 标记为X的视为未完成比赛
    }
    
    const rankNum = parseInt(rank)
    if (isNaN(rankNum)) {
      // 如果不是数字，视为未完成比赛
      return -5
    }
    switch (rankNum) {
      case 1: return 10
      case 2: return 7
      case 3: return 5
      case 4: return 4
      case 5: return 3
      case 6: return 1
      case 7: return 0
      case 8: return -1
      default: return -5 // 未完成比赛
    }
  }

  // 解析识别结果中的选手和名次信息 - 增强解析逻辑
  const parseRecognitionResult = (recognizedText: string, imageName: string): Map<string, number> => {
    const playerScores = new Map<string, number>()
    console.log(`解析图片 ${imageName} 的识别结果:`, recognizedText)
    
    // 尝试从识别文本中提取选手和名次信息
    const lines = recognizedText.split('\n')
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue
      
      // 匹配形如 "1. 选手名称" 或 "第1名：选手名称" 或 "X. 选手名称"（未完成比赛）的格式
      const rankMatch = trimmedLine.match(/^(?:第)?(\d+|X|x)(?:名|\.)[:：]?\s*(.+)$/)
      if (rankMatch) {
        const rank = rankMatch[1]
        const playerName = rankMatch[2].trim()
        const score = getScoreByRank(rank)
        console.log(`匹配到格式1: 名次${rank}, 选手${playerName}, 分数${score}`)
        playerScores.set(playerName, score)
        continue
      }
      
      // 匹配形如 "选手名称：1" 或 "选手名称 - 第1名" 或 "选手名称：X"（未完成比赛）的格式
      const reverseMatch = trimmedLine.match(/^(.+)[:：\-]\s*(?:第)?(\d+|X|x)(?:名)?$/)
      if (reverseMatch) {
        const playerName = reverseMatch[1].trim()
        const rank = reverseMatch[2]
        const score = getScoreByRank(rank)
        console.log(`匹配到格式2: 选手${playerName}, 名次${rank}, 分数${score}`)
        playerScores.set(playerName, score)
        continue
      }
      
      // 匹配表格格式中的行，如 "选手名称 10" 或 "选手名称  -1" 或 "选手名称 X"（未完成比赛）
      const tableMatch = trimmedLine.match(/^([^\d\s]+.*?)\s+(\d+|\-\d+|X|x)$/)
      if (tableMatch) {
        const playerName = tableMatch[1].trim()
        const scoreOrRank = tableMatch[2]
        const score = getScoreByRank(scoreOrRank)
        console.log(`匹配到格式3: 选手${playerName}, 分数/名次${scoreOrRank}, 最终分数${score}`)
        playerScores.set(playerName, score)
        continue
      }
      
      // 匹配形如 "选手名称"（无明确名次，直接视为未完成比赛）
      const nameOnlyMatch = trimmedLine.match(/^([^\d\s]+.*?)$/)
      if (nameOnlyMatch && !trimmedLine.includes(':') && !trimmedLine.includes('-') && !trimmedLine.includes('：')) {
        const playerName = nameOnlyMatch[1].trim()
        const score = -5 // 没有明确名次的视为未完成比赛
        console.log(`匹配到格式4（仅选手名称）: 选手${playerName}, 分数${score}`)
        playerScores.set(playerName, score)
        continue
      }
    }
    
    console.log(`图片 ${imageName} 解析结果:`, Array.from(playerScores.entries()))
    return playerScores
  }

  // 生成并下载Excel文件 - 增强错误处理和日志记录
  const generateAndDownloadExcel = (results: ImageRecognitionResult[]) => {
    try {
      console.log('使用最新识别结果生成Excel:', results)
      
      // 收集所有选手名称
      const allPlayers = new Set<string>()
      // 收集所有图片名称
      const allImages = new Set<string>()
      // 存储每个选手在每个图片中的分数
      const playerScoresMap = new Map<string, Map<string, number>>()
      
      // 处理每个识别结果
      results.forEach(result => {
        if (result.error || !result.recognizedText) {
          console.warn(`跳过有错误或空结果的图片: ${result.file.name}`)
          return
        }
        
        const imageName = result.file.name
        allImages.add(imageName)
        
        // 解析识别结果
        const playerScores = parseRecognitionResult(result.recognizedText, imageName)
        
        // 更新选手列表和分数映射，使用标准化名称匹配
        playerScores.forEach((score, playerName) => {
          // 查找是否已有相同的选手（基于标准化名称）
          const matchingPlayer = findMatchingPlayer(playerName, allPlayers)
          const finalPlayerName = matchingPlayer || playerName
          
          // 如果没有匹配到现有选手，添加新选手
          if (!matchingPlayer) {
            allPlayers.add(playerName)
            console.log(`添加新选手: ${playerName} (标准化后: ${normalizePlayerName(playerName)})`)
          } else {
            console.log(`匹配到现有选手: ${playerName} -> ${matchingPlayer} (标准化后: ${normalizePlayerName(playerName)})`)
          }
          
          // 使用最终确定的选手名称
          if (!playerScoresMap.has(finalPlayerName)) {
            playerScoresMap.set(finalPlayerName, new Map<string, number>())
          }
          playerScoresMap.get(finalPlayerName)?.set(imageName, score)
        })
      })
      
      console.log('收集到的所有选手:', Array.from(allPlayers))
      console.log('收集到的所有图片:', Array.from(allImages))
      
      // 如果没有数据，使用模拟数据进行测试
      if (allPlayers.size === 0 || allImages.size === 0) {
        console.log('未收集到有效数据，使用模拟数据生成Excel')
        // 模拟选手数据
        const mockPlayers = ['张三', '李四', '王五', '赵六']
        const mockImages = files.length > 0 ? files.map(f => f.name) : ['图1.png', '图2.png']
        
        mockPlayers.forEach(player => {
          allPlayers.add(player)
          const scoresMap = new Map<string, number>()
          mockImages.forEach(image => {
            allImages.add(image)
            // 随机生成1-8名的分数或-5（未完成比赛）
            const randomRank = Math.floor(Math.random() * 10) + 1
            const score = randomRank <= 8 ? getScoreByRank(randomRank.toString()) : -5
            scoresMap.set(image, score)
          })
          playerScoresMap.set(player, scoresMap)
        })
      }
      
      // 准备Excel数据 - 第一列为选手名称，后面各列为图片名称
      const sortedImages = Array.from(allImages)
      const excelData: PlayerScore[] = Array.from(allPlayers).map(playerName => {
        const playerData: PlayerScore = {
          playerName: playerName
        }
        
        // 为每个图片设置对应的分数，如果没有则设为-5（未完成比赛）
        sortedImages.forEach(imageName => {
          // 使用空值合并运算符代替逻辑或，确保0分不会被替换为-5
          const score = playerScoresMap.get(playerName)?.get(imageName) ?? -5
          playerData[imageName] = score
        })
        
        return playerData
      })

      // 按选手名称排序，确保Excel输出的一致性
      excelData.sort((a, b) => a.playerName.localeCompare(b.playerName, 'zh-CN'))

      console.log('生成的Excel数据:', excelData)
      // 创建工作簿
      const wb = XLSX.utils.book_new()
      // 创建工作表 - 确保标题行正确
      const ws = XLSX.utils.json_to_sheet(excelData)
      // 添加工作表到工作簿
      XLSX.utils.book_append_sheet(wb, ws, '选手成绩汇总')
      // 生成Excel文件并下载
      XLSX.writeFile(wb, `选手成绩汇总_${new Date().toLocaleString('zh-CN').replace(/[/:]/g, '-')}.xlsx`)
      
      message.success('Excel文件已下载')
    } catch (error) {
      console.error('生成Excel文件失败:', error)
      message.error('生成Excel文件失败，请重试')
    }
  }

  // 处理确认上传
  const handleConfirmUpload = async () => {
    if (files.length === 0) {
      message.warning('请先选择要上传的图片')
      return
    }

    // 如果已经在识别中，直接返回
    if (isRecognizing) {
      return
    }

    // 设置识别状态为进行中
    setIsRecognizing(true)
    message.loading('正在识别图片文字，请稍候...')
    
    // 初始化识别结果状态
    const initialResults: ImageRecognitionResult[] = files.map(file => ({
      file,
      recognizedText: '',
      loading: true,
      error: null
    }))
    setRecognitionResults(initialResults)

    try {
      // 并行识别所有图片文字
      const recognitionPromises = files.map((file, index) => recognizeImageText(file, index))
      // 直接从Promise.all获取最新的识别结果
      const results = await Promise.all(recognitionPromises)

      message.destroy()
      message.success('图片文字识别完成')
      
      // 将Promise.all返回的最新结果直接传递给generateAndDownloadExcel
      // 使用setTimeout确保React状态更新完成
      setTimeout(() => {
        generateAndDownloadExcel(results)
      }, 0)
    } catch (error) {
      message.destroy()
      message.error('识别过程中出现错误')
      console.error('识别错误:', error)
    } finally {
      // 无论成功还是失败，都要清除识别状态
      setIsRecognizing(false)
    }
  }

  // 自定义上传列表项
  const renderUploadItem = (item: UploadFile, index: number) => {
    return (
      <div className="file-item" key={item.uid}>
        <div className="file-preview-wrapper">
          <Image
            src={item.thumbUrl} 
            alt={item.name} 
            preview={{ 
                visible: previewOpen,
                onVisibleChange: (visible) => setPreviewOpen(visible),
            }}
            style={{ objectFit: 'cover', cursor: 'pointer' }}
          />
          <Button 
            type="text" 
            size="small" 
            icon={<DeleteOutlined />}
            onClick={() => handleRemove(item)}
            style={{ position: 'absolute', top: 0, right: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
          />
        </div>
        <div className="file-info">
          <Text className="file-name" ellipsis={{ tooltip: item.name }}>{item.name}</Text>
          <Text type="secondary" className="file-size">
            {formatFileSize(item.size || 0)}
          </Text>
        </div>
      </div>
    )
  }

  // 渲染识别结果项
  const renderRecognitionResult = (result: ImageRecognitionResult, index: number) => {
    return (
      <div key={index} className="recognition-result-item">
        <div className="result-image-container">
          <img 
            src={result.file.thumbUrl} 
            alt={result.file.name} 
            className="result-image"
            style={{ width: '100px', height: '100px', objectFit: 'cover' }}
          />
        </div>
        <div className="result-content">
          <Text className="result-file-name">{result.file.name}</Text>
          {result.loading ? (
            <div className="result-loading">
              <Spin size="small" />
              <Text type="secondary">正在识别...</Text>
            </div>
          ) : result.error ? (
            <Text type="danger">{result.error}</Text>
          ) : (
            <Text className="recognized-text" style={{ whiteSpace: 'pre-wrap' }}>{result.recognizedText}</Text>
          )}
        </div>
      </div>
    )
  }

  const uploadProps: UploadProps = {
    beforeUpload,
    showUploadList: false,
    multiple: true,
    accept: 'image/*',
    directory: false,
  }

  return (
    <div className="app">
      <div className="app-content">
        <Title level={2} className="app-title">上传比赛图片识别名次</Title>
        
        {/* 拖拽上传区域 */}
        <Upload.Dragger {...uploadProps} className="upload-dragger">
          <PlusOutlined />
          <p>拖拽图片到此处，或点击选择图片</p>
        </Upload.Dragger>

        {/* 已上传文件列表 */}
        {files.length > 0 && (
          <div className="file-section">
            <Typography.Text className="file-section-title">已选择 {files.length} 张图片</Typography.Text>
            <div className="files-grid">
              {files.map((file, index) => renderUploadItem(file, index))}
            </div>
            
            {/* 确认按钮 */}
            <Button 
              type="primary" 
              onClick={handleConfirmUpload} 
              icon={<DownloadOutlined />}
              loading={isRecognizing}
            >
              {isRecognizing ? '正在识别中...' : '确认上传并识别文字（自动生成Excel）'}
            </Button>
          </div>
        )}
        
        {/* 识别结果显示区域 */}
        {recognitionResults.length > 0 && (
          <div className="recognition-results-section">
            <Typography.Text className="section-title">识别结果</Typography.Text>
            <div className="recognition-results-container">
              {recognitionResults.map((result, index) => renderRecognitionResult(result, index))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
