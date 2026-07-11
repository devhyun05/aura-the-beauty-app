param(
  [string]$Profile = "aura-dev",
  [string]$Region = "ap-northeast-2",
  [Parameter(Mandatory = $true)]
  [string]$AlertEmail,
  [ValidateSet(1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653)]
  [int]$LambdaLogRetentionDays = 14
)

$ErrorActionPreference = "Stop"
$mediaLambdaLogGroup = "/aws/lambda/aura-media-postprocess-dev"
aws logs put-retention-policy `
  --log-group-name $mediaLambdaLogGroup `
  --retention-in-days $LambdaLogRetentionDays `
  --region $Region `
  --profile $Profile

if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure retention for $mediaLambdaLogGroup."
}

$topicName = "aura-ops-alerts-dev"
$topicArn = aws sns create-topic `
  --name $topicName `
  --tags Key=Project,Value=aura Key=Environment,Value=dev `
  --region $Region `
  --profile $Profile `
  --query TopicArn `
  --output text

if ($LASTEXITCODE -ne 0) {
  throw "Failed to create or resolve SNS topic $topicName."
}

$existingSubscription = aws sns list-subscriptions-by-topic `
  --topic-arn $topicArn `
  --region $Region `
  --profile $Profile `
  --query "Subscriptions[?Protocol=='email' && Endpoint=='$AlertEmail'] | [0].SubscriptionArn" `
  --output text

if ($LASTEXITCODE -ne 0) {
  throw "Failed to inspect SNS subscriptions for $topicName."
}

if (-not $existingSubscription -or $existingSubscription -eq "None") {
  aws sns subscribe `
    --topic-arn $topicArn `
    --protocol email `
    --notification-endpoint $AlertEmail `
    --region $Region `
    --profile $Profile | Out-Null

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to subscribe $AlertEmail to $topicName."
  }
}

function Set-AuraMetricAlarm {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Description,
    [Parameter(Mandatory = $true)]
    [string]$Namespace,
    [Parameter(Mandatory = $true)]
    [string]$MetricName,
    [Parameter(Mandatory = $true)]
    [string]$Statistic,
    [Parameter(Mandatory = $true)]
    [int]$Period,
    [Parameter(Mandatory = $true)]
    [int]$EvaluationPeriods,
    [Parameter(Mandatory = $true)]
    [double]$Threshold,
    [Parameter(Mandatory = $true)]
    [string[]]$Dimensions,
    [int]$DatapointsToAlarm = 1
  )

  aws cloudwatch put-metric-alarm `
    --alarm-name $Name `
    --alarm-description $Description `
    --namespace $Namespace `
    --metric-name $MetricName `
    --statistic $Statistic `
    --period $Period `
    --evaluation-periods $EvaluationPeriods `
    --datapoints-to-alarm $DatapointsToAlarm `
    --threshold $Threshold `
    --comparison-operator GreaterThanOrEqualToThreshold `
    --dimensions $Dimensions `
    --treat-missing-data notBreaching `
    --alarm-actions $topicArn `
    --ok-actions $topicArn `
    --region $Region `
    --profile $Profile

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure CloudWatch alarm $Name."
  }
}

Set-AuraMetricAlarm `
  -Name "aura-ai-dlq-not-empty" `
  -Description "AURA AI job DLQ contains one or more failed messages." `
  -Namespace "AWS/SQS" `
  -MetricName "ApproximateNumberOfMessagesVisible" `
  -Statistic "Maximum" `
  -Period 60 `
  -EvaluationPeriods 1 `
  -Threshold 1 `
  -Dimensions "Name=QueueName,Value=aura-ai-jobs-dlq-dev"

Set-AuraMetricAlarm `
  -Name "aura-ai-job-age-high" `
  -Description "AURA AI job has remained visible in the queue for at least five minutes." `
  -Namespace "AWS/SQS" `
  -MetricName "ApproximateAgeOfOldestMessage" `
  -Statistic "Maximum" `
  -Period 60 `
  -EvaluationPeriods 2 `
  -DatapointsToAlarm 2 `
  -Threshold 300 `
  -Dimensions "Name=QueueName,Value=aura-ai-jobs-dev"

Set-AuraMetricAlarm `
  -Name "aura-media-lambda-errors" `
  -Description "AURA media postprocess Lambda reported an error." `
  -Namespace "AWS/Lambda" `
  -MetricName "Errors" `
  -Statistic "Sum" `
  -Period 300 `
  -EvaluationPeriods 1 `
  -Threshold 1 `
  -Dimensions "Name=FunctionName,Value=aura-media-postprocess-dev"

Set-AuraMetricAlarm `
  -Name "aura-api-5xx-high" `
  -Description "AURA HTTP API returned at least five server errors within five minutes." `
  -Namespace "AWS/ApiGateway" `
  -MetricName "5xx" `
  -Statistic "Sum" `
  -Period 300 `
  -EvaluationPeriods 1 `
  -Threshold 5 `
  -Dimensions "Name=ApiId,Value=zk4m2qahai"

Write-Output "SNS_TOPIC_ARN=$topicArn"
Write-Output "ALERT_EMAIL=$AlertEmail"
Write-Output "LAMBDA_LOG_RETENTION_DAYS=$LambdaLogRetentionDays"
Write-Output "Confirm the SNS subscription from the AWS email before alarm notifications can be delivered."
