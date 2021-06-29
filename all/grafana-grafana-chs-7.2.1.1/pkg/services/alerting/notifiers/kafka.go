package notifiers

import (
	"strconv"

	"fmt"

	"github.com/grafana/grafana/pkg/bus"
	"github.com/grafana/grafana/pkg/components/simplejson"
	"github.com/grafana/grafana/pkg/infra/log"
	"github.com/grafana/grafana/pkg/models"
	"github.com/grafana/grafana/pkg/services/alerting"
)

func init() {
	alerting.RegisterNotifier(&alerting.NotifierPlugin{
		Type:        "kafka",
		Name:        "Kafka REST代理",
		Description: "发送通知到Kafka Rest代理",
		Heading:     "Kafka设置",
		Factory:     NewKafkaNotifier,
		Options: []alerting.NotifierOption{
			{
				Label:        "Kafka REST代理",
				Element:      alerting.ElementTypeInput,
				InputType:    alerting.InputTypeText,
				Placeholder:  "http://localhost:8082",
				PropertyName: "kafkaRestProxy",
				Required:     true,
			},
			{
				Label:        "Topic",
				Element:      alerting.ElementTypeInput,
				InputType:    alerting.InputTypeText,
				Placeholder:  "topic1",
				PropertyName: "kafkaTopic",
				Required:     true,
			},
		},
	})
}

// NewKafkaNotifier is the constructor function for the Kafka notifier.
func NewKafkaNotifier(model *models.AlertNotification) (alerting.Notifier, error) {
	endpoint := model.Settings.Get("kafkaRestProxy").MustString()
	if endpoint == "" {
		return nil, alerting.ValidationError{Reason: "在设置中找不到kafka rest代理端点属性"}
	}
	topic := model.Settings.Get("kafkaTopic").MustString()
	if topic == "" {
		return nil, alerting.ValidationError{Reason: "在设置中找不到kafka主题属性"}
	}

	return &KafkaNotifier{
		NotifierBase: NewNotifierBase(model),
		Endpoint:     endpoint,
		Topic:        topic,
		log:          log.New("alerting.notifier.kafka"),
	}, nil
}

// KafkaNotifier is responsible for sending
// alert notifications to Kafka.
type KafkaNotifier struct {
	NotifierBase
	Endpoint string
	Topic    string
	log      log.Logger
}

// Notify sends the alert notification.
func (kn *KafkaNotifier) Notify(evalContext *alerting.EvalContext) error {
	state := evalContext.Rule.State

	customData := triggMetrString
	for _, evt := range evalContext.EvalMatches {
		customData += fmt.Sprintf("%s: %v\n", evt.Metric, evt.Value)
	}

	kn.log.Info("通知Kafka", "alert_state", state)

	recordJSON := simplejson.New()
	records := make([]interface{}, 1)

	bodyJSON := simplejson.New()
	//get alert state in the kafka output issue #11401
	bodyJSON.Set("alert_state", state)
	bodyJSON.Set("description", evalContext.Rule.Name+" - "+evalContext.Rule.Message)
	bodyJSON.Set("client", "Grafana")
	bodyJSON.Set("details", customData)
	bodyJSON.Set("incident_key", "alertId-"+strconv.FormatInt(evalContext.Rule.ID, 10))

	ruleURL, err := evalContext.GetRuleURL()
	if err != nil {
		kn.log.Error("获取规则链接失败", "error", err)
		return err
	}
	bodyJSON.Set("client_url", ruleURL)

	if kn.NeedsImage() && evalContext.ImagePublicURL != "" {
		contexts := make([]interface{}, 1)
		imageJSON := simplejson.New()
		imageJSON.Set("type", "image")
		imageJSON.Set("src", evalContext.ImagePublicURL)
		contexts[0] = imageJSON
		bodyJSON.Set("contexts", contexts)
	}

	valueJSON := simplejson.New()
	valueJSON.Set("value", bodyJSON)
	records[0] = valueJSON
	recordJSON.Set("records", records)
	body, _ := recordJSON.MarshalJSON()

	topicURL := kn.Endpoint + "/topics/" + kn.Topic

	cmd := &models.SendWebhookSync{
		Url:        topicURL,
		Body:       string(body),
		HttpMethod: "POST",
		HttpHeader: map[string]string{
			"Content-Type": "application/vnd.kafka.json.v2+json",
			"Accept":       "application/vnd.kafka.v2+json",
		},
	}

	if err := bus.DispatchCtx(evalContext.Ctx, cmd); err != nil {
		kn.log.Error("无法发送通知到Kafka", "error", err, "body", string(body))
		return err
	}

	return nil
}
