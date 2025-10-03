import React, { useState } from 'react'
import { Upload, Modal, Button, message, Typography, Spin } from 'antd'
import type { UploadProps, UploadFile } from 'antd'
import { PlusOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons'
import axios from 'axios'
import * as XLSX from 'xlsx'
import './App.less'

const { Title, Text } = Typography

// 豆包多模态API配置（请替换为您实际的API密钥和配置）
const DOUBAO_API_KEY = 'ab229391-bea8-475a-8927-4d1423ebfdf0'
// const DOUBAO_API_SECRET = 'YOUR_DOUBAO_API_SECRET'
const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

// 图片识别结果接口
interface ImageRecognitionResult {
  file: UploadFile
  recognizedText: string
  loading: boolean
  error: string | null
}

function App() {
  // 存储上传的文件列表
  const [files, setFiles] = useState<UploadFile[]>([])
  // 预览图片的索引
  const [previewIndex, setPreviewIndex] = useState<number>(-1)
  // 是否显示预览
  const [previewOpen, setPreviewOpen] = useState<boolean>(false)
  // 识别结果列表
  const [recognitionResults, setRecognitionResults] = useState<ImageRecognitionResult[]>([])

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
  const handlePreview = (index: number) => {
    setPreviewIndex(index)
    setPreviewOpen(true)
  }

  // 处理移除文件
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

  // 调用豆包多模态API识别图片文字
  const recognizeImageText = async (file: UploadFile, index: number): Promise<void> => {
    // 更新当前文件的加载状态
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

      // 构建请求数据
      const requestData = {
        model: 'doubao-seed-1-6-vision-250815', // 豆包多模态模型
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
                text: '请识别图片中每个名次分别对应的车手名次，依次返回对应的名次和车手名称'
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
      
      // 更新识别结果
      setRecognitionResults(prev => 
        prev.map((item, i) => 
          i === index ? { ...item, recognizedText, loading: false } : item
        )
      )
    } catch (error) {
      console.error('识别图片文字失败:', error)
      setRecognitionResults(prev => 
        prev.map((item, i) => 
          i === index ? { ...item, loading: false, error: '识别失败，请重试' } : item
        )
      )
    }
  }

  // 生成并下载Excel文件
  const generateAndDownloadExcel = (results: ImageRecognitionResult[]) => {
    try {
      console.log('recognitionResults', results)
      // 准备Excel数据
      const excelData = results.map(result => ({
        '文件名': result.file.name,
        '识别结果': result.error || result.recognizedText
      }))

      // 创建工作簿
      const wb = XLSX.utils.book_new()
      // 创建工作表
      const ws = XLSX.utils.json_to_sheet(excelData)
      // 添加工作表到工作簿
      XLSX.utils.book_append_sheet(wb, ws, '图片文字识别结果')
      // 生成Excel文件并下载
      XLSX.writeFile(wb, `图片识别结果_${new Date().toLocaleString('zh-CN').replace(/[/:]/g, '-')}.xlsx`)
      
      message.success('Excel文件已下载')
    } catch (error) {
      message.error('生成Excel文件失败，请重试')
    }
  }

  // 处理确认上传
  const handleConfirmUpload = async () => {
    if (files.length === 0) {
      message.warning('请先选择要上传的图片')
      return
    }

    message.loading('正在识别图片文字，请稍候...')
    
    // 初始化识别结果状态
    const initialResults: ImageRecognitionResult[] = files.map(file => ({
      file,
      recognizedText: '',
      loading: true,
      error: null
    }))
    setRecognitionResults(initialResults)

    // 并行识别所有图片文字
    const recognitionPromises = files.map((file, index) => recognizeImageText(file, index))
    const results = await Promise.all(recognitionPromises)

    message.destroy()
    message.success('图片文字识别完成')
    
    console.log('recognitionResults', recognitionResults)
    // 立即生成并下载Excel文件
    generateAndDownloadExcel(initialResults) // TODO:这里的结果不对, 需要去Promise.all把 results抛出来
  }

  // 自定义上传列表项
  const renderUploadItem = (item: UploadFile, index: number) => {
    return (
      <div className="file-item" key={item.uid}>
        <div className="file-preview-wrapper">
          <img 
            src={item.thumbUrl} 
            alt={item.name} 
            className="file-preview"
            onClick={() => handlePreview(index)}
          />
          <Button 
            type="text" 
            size="small" 
            icon={<DeleteOutlined />}
            onClick={() => handleRemove(item)}
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
        <Title level={2} className="app-title">图片上传</Title>
        
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
            <Button type="primary" onClick={handleConfirmUpload} icon={<DownloadOutlined />}>
              确认上传并识别文字（自动生成Excel）
            </Button>
          </div>
        )}

        {/* 图片预览模态框 */}
        <Modal
          open={previewOpen}
          title={files[previewIndex]?.name}
          footer={null}
          onCancel={() => setPreviewOpen(false)}
          centered
          width={800}
        >
          <img 
            alt="预览图片" 
            style={{ width: '100%' }}
            src={files[previewIndex]?.thumbUrl}
          />
        </Modal>

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
