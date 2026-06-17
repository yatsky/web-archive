import { Button } from '@web-archive/shared/components/button'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { GenerateTagProps } from '@web-archive/shared/utils'
import { useRequest } from 'ahooks'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@web-archive/shared/components/tooltip'
import type { AITagConfig } from '@web-archive/shared/types'
import { useTranslation } from 'react-i18next'
import { generateTag } from '~/data/tag'

interface Props {
  config: AITagConfig
  onValidate: () => Promise<boolean>
}

async function generateTagByConfig(config: GenerateTagProps) {
  // Always test through the server so OpenAI-compatible endpoints are reached
  // server-side (no browser CORS) — the same path real tagging uses.
  return await generateTag(config)
}

function AITagTestConnectionButton({ config, onValidate }: Props) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'untested' | 'success' | 'error'>('untested')
  const [error, setError] = useState<string | null>()

  const { runAsync: testConnection, loading } = useRequest(generateTagByConfig, {
    manual: true,
  })

  async function handleTest() {
    const isValid = await onValidate()
    if (!isValid)
      return

    try {
      await testConnection({
        title: 'Test Title',
        pageDesc: 'Test Description',
        ...config,
      })
      setStatus('success')
    }
    catch (error: any) {
      setStatus('error')
      setError(error?.message)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            onClick={handleTest}
            disabled={loading}
            className="min-w-[120px] flex items-center gap-2"
          >
            {loading
              ? (
                <>
                  <Loader2 className="animate-spin"></Loader2>
                  {t('testing')}
                </>
                )
              : (
                <>
                  {status === 'untested' && (
                    <>
                      {t('test-connection')}
                    </>
                  )}
                  {status === 'success' && (
                    <>
                      <Check className="w-4 h-4 text-primary" />
                      {t('successed')}
                    </>
                  )}
                  {status === 'error' && (
                    <>
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      {t('failed')}
                    </>
                  )}
                </>
                )}
          </Button>
        </TooltipTrigger>
        {
          status === 'error' && (
            <TooltipContent>
              <p className="text-destructive">
                {error}
              </p>
            </TooltipContent>
          )
        }

      </Tooltip>
    </TooltipProvider>

  )
}

export default AITagTestConnectionButton
